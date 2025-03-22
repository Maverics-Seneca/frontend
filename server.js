const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET;

// -----------------------------------------
// Middleware Setup
// -----------------------------------------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -----------------------------------------
// Utility Functions
// -----------------------------------------

/**
 * Calculates analytics for medication refill based on current date and medication details.
 * @param {Object} medication - Medication object with endDate, frequency, inventory.
 * @param {Date} currentDate - Current date for calculations.
 * @returns {Object} Enhanced medication object with analytics.
 */
function calculateRefillAnalytics(medication, currentDate) {
    const endDate = new Date(medication.endDate);
    const dosesPerDay = {
        'Once a day': 1,
        'Twice a day': 2,
        'Thrice a day': 3
    }[medication.frequency] || 1;
    const dailyUsage = dosesPerDay;
    const totalDosesNeeded = Math.max(1, Math.ceil((endDate - currentDate) / (1000 * 60 * 60 * 24)) * dailyUsage); // Avoid division by zero
    const inventoryDays = medication.inventory > 0 ? Math.floor(medication.inventory / dailyUsage) : 0;
    const daysToEnd = Math.max(0, Math.floor((endDate - currentDate) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.min(inventoryDays, daysToEnd);
    const nextRefillDate = new Date(currentDate);
    if (inventoryDays > 0) {
        nextRefillDate.setDate(currentDate.getDate() + inventoryDays);
    } else {
        nextRefillDate.setDate(currentDate.getDate());
    }

    let inventoryStatus = 'Good';
    if (daysRemaining <= 7) inventoryStatus = 'Low';
    else if (daysRemaining <= 14) inventoryStatus = 'Warning';

    const inventoryPercentage = totalDosesNeeded > 0 ? Math.min(100, Math.max(0, (medication.inventory / totalDosesNeeded) * 100)) : 0;

    return {
        ...medication,
        daysRemaining,
        inventoryStatus,
        nextRefillDate: nextRefillDate.toISOString().split('T')[0],
        inventoryPercentage: inventoryPercentage.toFixed(2)
    };
}

/**
 * Middleware to authenticate users via JWT token.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Next middleware function.
 */
const authenticateUser = (req, res, next) => {
    console.log('authenticateUser running for:', req.method, req.url); // Log authentication attempt
    const token = req.cookies.authToken;
    console.log('Token from cookie:', token); // Log retrieved token

    if (!token) {
        console.log('No token found, redirecting to home.'); // Log missing token
        return res.render('pages/index', {
            isLoggedIn: false,
            role: null,
            message: 'Kindly sign in before accessing this page.',
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.userId;
        req.email = decoded.email;
        req.name = decoded.name;
        req.role = decoded.role;
        req.organizationId = decoded.organizationId;
        console.log('Decoded token:', decoded); // Log successful token decode
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message); // Log token verification error
        res.clearCookie('authToken');
        return res.render('pages/index', {
            isLoggedIn: false,
            role: null,
            message: 'Session expired. Please sign in again.',
        });
    }
};

// Debug middleware for logging incoming requests
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`); // Log request details
    console.log(`Incoming role: ${req.role}`); // Log role (before authentication)
    console.log('Cookies:', req.cookies); // Log cookies
    next();
});

// -----------------------------------------
// Public Routes (No Authentication)
// -----------------------------------------

// Home route (requires authentication despite being root)
app.get('/', authenticateUser, (req, res) => {
    console.log('Rendering home page. Is logged in:', !!req.cookies.authToken); // Log login status
    console.log('User role:', req.role); // Log user role
    res.render('pages/index', {
        isLoggedIn: !!req.cookies.authToken,
        userName: req.name,
        role: req.role
    });
});

// Privacy Policy Route
app.get('/privacy-policy', (req, res) => {
    const token = req.cookies.authToken;
    let isLoggedIn = false;
    let userName = null;
    let role = null;

    // Check if token exists and attempt to verify it
    if (token) {
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            isLoggedIn = true;
            userName = decoded.name;
            role = decoded.role;
            console.log('User authenticated for privacy-policy:', { userName, role }); // Log authenticated user
        } catch (error) {
            console.error('Token verification failed for privacy-policy:', error.message); // Log token error
            // If token is invalid, treat as not logged in but still render the page
        }
    } else {
        console.log('No token found for privacy-policy, rendering as guest'); // Log guest access
    }

    res.render('pages/extra/privacy-policy', {
        isLoggedIn: isLoggedIn,
        userName: userName,
        role: role
    });
});

// Terms of Service Route
app.get('/terms-of-service', (req, res) => {
    const token = req.cookies.authToken;
    let isLoggedIn = false;
    let userName = null;
    let role = null;

    // Check if token exists and attempt to verify it
    if (token) {
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            isLoggedIn = true;
            userName = decoded.name;
            role = decoded.role;
            console.log('User authenticated for terms-of-service:', { userName, role }); // Log authenticated user
        } catch (error) {
            console.error('Token verification failed for terms-of-service:', error.message); // Log token error
            // If token is invalid, treat as not logged in but still render the page
        }
    } else {
        console.log('No token found for terms-of-service, rendering as guest'); // Log guest access
    }

    res.render('pages/extra/terms-of-service', {
        isLoggedIn: isLoggedIn,
        userName: userName,
        role: role
    });
});

// Admin signup page
app.get('/sign-up-admin', async (req, res) => {
    try {
        const response = await axios.get('http://middleware:3001/organization/get-all');
        const organizations = response.data;
        console.log('Fetched organizations for signup:', organizations); // Log fetched organizations

        res.render('pages/auth/sign-up-admin', {
            isLoggedIn: false,
            organizations
        });
    } catch (error) {
        console.error('Error fetching organizations for signup:', error.message); // Log error
        res.render('pages/auth/sign-up-admin', {
            isLoggedIn: false,
            organizations: [],
            error: 'Failed to load organizations'
        });
    }
});

// Static auth and policy routes
app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in')); // Render sign-in page
app.get('/sign-in-caretaker', (req, res) => res.render('pages/auth/sign-in-caretaker'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up')); // Render sign-up page
app.get('/recover-password', (req, res) => res.render('pages/auth/recover-password')); // Render password recovery
app.get('/lock-screen', (req, res) => res.render('pages/auth/lock-screen')); // Render lock screen
app.get('/confirm-mail', (req, res) => res.render('pages/auth/confirm-mail')); // Render confirm mail

// -----------------------------------------
// Admin Routes
// -----------------------------------------

// All patients route (admin only)
app.get('/all-patients', authenticateUser, async (req, res) => {
    if (req.role !== 'admin') {
        console.log('Access denied: Not an admin'); // Log access denial
        return res.status(403).render('pages/index', {
            isLoggedIn: true,
            role: req.role,
            message: 'Access denied. Admins only.',
        });
    }
    try {
        console.log('Fetching patients for organizationId:', req.organizationId); // Log fetch attempt
        const response = await axios.get(`http://middleware:3001/patients?organizationId=${req.organizationId}`);
        res.render('pages/admin/all-patients', {
            isLoggedIn: true,
            userName: req.name,
            role: req.role,
            patients: response.data,
        });
    } catch (error) {
        console.error('Error fetching patients:', error.message); // Log error
        res.render('pages/admin/all-patients', {
            isLoggedIn: true,
            userName: req.name,
            role: req.role,
            error: 'Failed to load patients.',
        });
    }
});

// Update patient (admin only)
app.post('/patients/:id', authenticateUser, async (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    try {
        const { name, email, phone } = req.body;
        const patientId = req.params.id;
        await axios.post(`http://middleware:3001/patients/${patientId}`, {
            name,
            email,
            phone,
            organizationId: req.organizationId,
        });
        res.status(200).send('Patient updated');
    } catch (error) {
        console.error('Error updating patient:', error.message); // Log error
        res.status(500).send('Failed to update patient');
    }
});

// Delete patient (admin only)
app.delete('/patients/:id', authenticateUser, async (req, res) => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    try {
        const patientId = req.params.id;
        await axios.delete(`http://middleware:3001/patients/${patientId}`);
        res.status(200).send('Patient deleted');
    } catch (error) {
        console.error('Error deleting patient:', error.message); // Log error
        res.status(500).send('Failed to delete patient');
    }
});

// Admin dashboard (admin only)
app.get('/admin-dashboard', authenticateUser, async (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    const userId = req.userId;
    console.log('Rendering admin dashboard for user:', userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view this page.',
        });
    }

    try {
        const [patientsResponse, remindersResponse, logsResponse] = await Promise.all([
            axios.get(`http://middleware:3001/patients?organizationId=${req.organizationId}`),
            axios.get(`http://middleware:3001/reminders/all?organizationId=${req.organizationId}`),
            axios.get(`http://middleware:3001/logs?organizationId=${req.organizationId}&limit=5`)
        ]);

        const patients = patientsResponse.data;
        const reminders = remindersResponse.data;
        const recentLogs = logsResponse.data;

        res.render('pages/admin/admin-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            patients,
            reminders,
            recentLogs
        });
    } catch (error) {
        console.error('Error fetching admin dashboard data:', error.message); // Log error
        res.render('pages/admin/admin-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            error: 'Failed to load dashboard data',
            patients: [],
            reminders: [],
            recentLogs: []
        });
    }
});

// Add patient page (admin only)
app.get('/add-patient', authenticateUser, (req, res) => {
    console.log('Rendering add-patient page for user:', req.userId); // Log render attempt

    const isLoggedIn = !!req.cookies.authToken;
    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to add patients.',
        });
    }

    res.render('pages/admin/add-patient', {
        isLoggedIn,
        userName: req.name,
        role: req.role
    });
});

// Add patient (admin only)
app.post('/add-patient', authenticateUser, async (req, res) => {
    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to add patients.',
        });
    }

    const { patientName, dob, gender, medicalHistory, guardianName, guardianRelation, guardianPhone, email, phone } = req.body;
    console.log('New Patient Data:', req.body); // Log patient data
    // TODO: Sanitize patientName, email, phone, etc., to prevent XSS/SQL injection

    const firstName = patientName.split(' ')[0].toLowerCase();
    const lastFourPhone = phone.slice(-4);
    const tempPassword = `${firstName}${lastFourPhone}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    try {
        const response = await axios.post('http://middleware:3001/users', {
            email,
            name: patientName,
            phone,
            password: hashedPassword,
            role: 'user',
            organizationId: req.organizationId,
            dob,
            gender,
            medicalHistory,
            guardianName,
            guardianRelation,
            guardianPhone
        });

        console.log('Patient added successfully:', response.data); // Log success
        res.redirect('/all-patients');
    } catch (error) {
        console.error('Error adding patient:', error.message); // Log error
        res.render('pages/admin/add-patient', {
            isLoggedIn: true,
            userName: req.name,
            role: req.role,
            error: 'Failed to add patient. Please try again.',
        });
    }
});

// Logs page (admin and owner only)
app.get('/logs', authenticateUser, async (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    const userId = req.userId;
    const role = req.role;
    console.log('Rendering logs page for user:', userId, 'with role:', role); // Log render attempt

    if (role !== 'admin' && role !== 'owner') {
        console.log('Access denied: User is not an admin or owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin or owner to view logs.',
        });
    }

    try {
        const response = await axios.get('http://middleware:3001/logs', {
            params: { userId, role }
        });
        const logs = response.data;

        res.render('pages/admin/logs', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            logs,
        });
    } catch (error) {
        console.error('Error fetching logs:', error.message); // Log error
        res.render('pages/admin/logs', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            logs: [],
            error: 'Failed to load logs',
        });
    }
});

// -----------------------------------------
// Owner Routes
// -----------------------------------------

// Add admin page (owner only)
app.get('/add-admin', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering add-admin page for user:', userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an owner to add administrators.',
        });
    }

    try {
        const response = await axios.get('http://middleware:3001/organization/get-all');
        const organizations = response.data;
        console.log('Fetched organizations for add-admin:', organizations); // Log fetched data

        res.render('pages/owner/add-admin', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations,
            userId
        });
    } catch (error) {
        console.error('Error fetching organizations for add-admin:', error.message); // Log error
        res.render('pages/owner/add-admin', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations: [],
            error: 'Failed to load organizations'
        });
    }
});

// Add admin (owner only)
app.post('/add-admin', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { name, email, phone, organizationId } = req.body;
    console.log('Add admin request received:', req.body); // Log request data
    // TODO: Sanitize name, email, phone to prevent injection attacks

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an owner to add administrators.',
        });
    }

    const tempPassword = `${name.replace(/\s/g, '').toLowerCase()}${phone.slice(-4)}`;
    console.log('Generated temporary password:', tempPassword); // Log generated password

    try {
        const response = await axios.post('http://middleware:3001/auth/register-admin', {
            name,
            email,
            phone,
            password: tempPassword,
            organizationId,
            role: 'admin'
        });

        const orgResponse = await axios.get('http://middleware:3001/organization/get-all');
        const organizations = orgResponse.data;

        res.render('pages/owner/add-admin', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            organizations,
            userId,
            success: `Admin added successfully! Temporary password: ${tempPassword}`
        });
    } catch (error) {
        console.error('Error adding admin:', error.message); // Log error
        const orgResponse = await axios.get('http://middleware:3001/organization/get-all');
        const organizations = orgResponse.data;

        res.render('pages/owner/add-admin', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            organizations,
            userId,
            error: 'Failed to add admin: ' + (error.response?.data?.message || error.message)
        });
    }
});

// All admins page (owner only)
app.get('/all-admins', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering all-admins page for user:', userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an owner to view all administrators.',
        });
    }

    try {
        const orgsResponse = await axios.get('http://middleware:3001/organization/get', {
            params: { userId }
        });
        const organizations = Array.isArray(orgsResponse.data) ? orgsResponse.data : [];
        console.log('Fetched organizations for user:', organizations); // Log fetched organizations

        if (organizations.length === 0) {
            return res.render('pages/owner/all-admins', {
                isLoggedIn,
                userName: req.name,
                role: req.role,
                admins: [],
                error: 'No organizations found for this owner'
            });
        }

        const organizationIds = organizations.map(org => org.id);
        const adminsPromises = organizationIds.map(orgId =>
            axios.get('http://middleware:3001/auth/get-all-admins', {
                params: { organizationId: orgId }
            })
        );
        const adminsResponses = await Promise.all(adminsPromises);
        const admins = adminsResponses
            .flatMap(response => Array.isArray(response.data) ? response.data : [])
            .map(admin => ({
                ...admin,
                userId: admin.id || admin.userId,
                createdAt: admin.createdAt && admin.createdAt._seconds
                    ? new Date(admin.createdAt._seconds * 1000).toISOString()
                    : admin.createdAt || null
            }));
        console.log('Fetched admins across all organizations:', admins); // Log fetched admins

        res.render('pages/owner/all-admins', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            admins
        });
    } catch (error) {
        console.error('Error fetching admins:', error.message); // Log error
        res.render('pages/owner/all-admins', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            admins: [],
            error: 'Failed to load administrators'
        });
    }
});

// Update admin (owner only)
app.post('/admins/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, organizationId } = req.body;
    console.log('Update admin request received:', { id, name, email, phone, organizationId }); // Log request data
    // TODO: Sanitize inputs to prevent injection

    if (req.role !== 'owner') {
        return res.status(403).json({ message: 'Access denied. You must be an owner to update administrators.' });
    }

    try {
        const response = await axios.post(`http://middleware:3001/auth/update-admin/${id}`, {
            name,
            email,
            phone,
            organizationId
        });
        res.json({ message: 'Admin updated successfully' });
    } catch (error) {
        console.error('Error updating admin:', error.message); // Log error
        res.status(error.response?.status || 500).json({ message: 'Failed to update admin', error: error.response?.data?.message || error.message });
    }
});

// Delete admin (owner only)
app.delete('/admins/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    console.log('Delete admin request received for id:', id); // Log request

    if (req.role !== 'owner') {
        return res.status(403).json({ message: 'Access denied. You must be an owner to delete administrators.' });
    }

    try {
        const response = await axios.delete(`http://middleware:3001/auth/delete-admin/${id}`);
        res.json({ message: 'Admin deleted successfully' });
    } catch (error) {
        console.error('Error deleting admin:', error.message); // Log error
        res.status(error.response?.status || 500).json({ message: 'Failed to delete admin', error: error.response?.data?.message || error.message });
    }
});

// Owner dashboard (owner only)
app.get('/owner-dashboard', authenticateUser, async (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    const userId = req.userId;
    console.log('Rendering owner dashboard for user:', userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an owner to view this page.',
        });
    }

    try {
        const orgsResponse = await axios.get(`http://middleware:3001/organization/get?userId=${userId}`);
        const organizations = Array.isArray(orgsResponse.data) ? orgsResponse.data : [];
        console.log('Fetched organizations:', organizations); // Log fetched organizations

        if (organizations.length === 0) {
            return res.render('pages/owner/owner-dashboard', {
                isLoggedIn,
                userName: req.name,
                role: req.role,
                admins: [],
                patients: [],
                caretakers: [],
                medications: [],
                recentLogs: [],
                organizations,
                error: 'No organizations found for this owner'
            });
        }

        const organizationIds = organizations.map(org => org.id);
        console.log('Organization IDs:', organizationIds); // Log organization IDs

        const [adminsResponses, patientsResponses, caretakersResponses, medicationsResponses, logsResponses] = await Promise.all([
            Promise.all(organizationIds.map(orgId =>
                axios.get(`http://middleware:3001/auth/get-all-admins?organizationId=${orgId}`).catch(() => ({ data: [] }))
            )),
            Promise.all(organizationIds.map(orgId =>
                axios.get(`http://middleware:3001/patients?organizationId=${orgId}`).catch(() => ({ data: [] }))
            )),
            Promise.all(organizationIds.map(orgId =>
                axios.get(`http://middleware:3001/caretakers/all?organizationId=${orgId}`).catch(() => ({ data: [] }))
            )),
            Promise.all(organizationIds.map(orgId =>
                axios.get(`http://middleware:3001/medications/all?organizationId=${orgId}`).catch(() => ({ data: [] }))
            )),
            Promise.all(organizationIds.map(orgId =>
                axios.get(`http://middleware:3001/logs?organizationId=${orgId}&limit=5`).catch(() => ({ data: [] }))
            ))
        ]);

        const admins = adminsResponses.flatMap(response => response.data);
        const patients = patientsResponses.flatMap(response => response.data);
        const caretakers = caretakersResponses.flatMap(response => response.data);
        const medications = medicationsResponses.flatMap(response => response.data);
        const recentLogs = logsResponses
            .flatMap(response => response.data)
            .sort((a, b) => (b.timestamp?._seconds || 0) - (a.timestamp?._seconds || 0))
            .slice(0, 5);
        console.log('Aggregated data:', { admins, patients, caretakers, medications, recentLogs, organizations }); // Log aggregated data

        res.render('pages/owner/owner-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            admins,
            patients,
            caretakers,
            medications,
            recentLogs,
            organizations
        });
    } catch (error) {
        console.error('Error fetching owner dashboard data:', error.message); // Log error
        res.render('pages/owner/owner-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            error: 'Failed to load dashboard data',
            admins: [],
            patients: [],
            caretakers: [],
            medications: [],
            recentLogs: [],
            organizations: []
        });
    }
});

// Add organization page (owner only)
app.get('/add-organization', authenticateUser, (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering add-organization page for user:', req.userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view Organizations.',
        });
    }

    res.render('pages/owner/add-organization', {
        isLoggedIn,
        userName: req.name,
        role: req.role,
        userId: req.userId
    });
});

// Add organization (owner only)
app.post('/add-organization', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { name, description } = req.body;
    console.log('Add organization request received for user:', userId); // Log request
    // TODO: Sanitize name and description

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view Organizations.',
        });
    }

    try {
        const response = await axios.post('http://middleware:3001/organization/create', {
            userId,
            name,
            description
        });

        res.redirect('/all-organizations');
    } catch (error) {
        console.error('Error adding organization:', error.message); // Log error
        res.render('pages/owner/add-organization', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            userId: req.userId,
            error: 'Failed to add organization'
        });
    }
});

// All organizations page (owner only)
app.get('/all-organizations', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering all-organizations page for user:', userId, 'with role:', req.role); // Log render attempt

    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner'); // Log access denial
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an owner to view Organizations.',
        });
    }

    try {
        const response = await axios.get('http://middleware:3001/organization/get', {
            params: { userId }
        });
        console.log('Raw response.data:', response.data); // Log raw data

        const organizations = Array.isArray(response.data) ? response.data.map(org => {
            const createdAtSeconds = org.createdAt && org.createdAt.seconds ? org.createdAt.seconds : null;
            console.log('Processing org:', org, 'createdAtSeconds:', createdAtSeconds); // Log each org processing
            return {
                ...org,
                createdAt: createdAtSeconds ? new Date(createdAtSeconds * 1000).toISOString() : null
            };
        }) : [];
        console.log('Processed organizations:', organizations); // Log processed organizations

        res.render('pages/owner/all-organizations', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations
        });
    } catch (error) {
        console.error('Error fetching organizations:', error.message); // Log error
        res.render('pages/owner/all-organizations', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations: [],
            error: 'Failed to load organizations'
        });
    }
});

// Update organization (owner only)
app.put('/organization/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    console.log('Update organization request received for ID:', id); // Log request
    // TODO: Sanitize name and description

    try {
        await axios.put(`http://middleware:3001/organization/${id}`, {
            userId: req.userId,
            name,
            description
        });
        res.status(200).send('Organization updated successfully');
    } catch (error) {
        console.error('Error updating organization:', error.message); // Log error
        res.status(error.response?.status || 500).send('Failed to update organization');
    }
});

// Delete organization (owner only)
app.delete('/organization/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    console.log('Delete organization request received for ID:', id); // Log request

    try {
        await axios.delete(`http://middleware:3001/organization/${id}`, {
            data: { userId: req.userId }
        });
        res.status(200).send('Organization deleted successfully');
    } catch (error) {
        console.error('Error deleting organization:', error.message); // Log error
        res.status(error.response?.status || 500).send('Failed to delete organization');
    }
});

// -----------------------------------------
// Patient Routes
// -----------------------------------------

// Caretaker Dashboard
app.get('/caretaker-dashboard', async (req, res) => {
    const isLoggedIn = !!req.cookies.patientId;
    const patientId = req.cookies.patientId; // Get from cookie
    console.log('Rendering patient dashboard for user:', patientId, 'with role:', req.role);

    const currentDate = new Date(); // Use current date dynamically
    let refillAlerts = [], currentMedications = [], reminders = [], medicineHistory = [], caretakers = [], medicationDetails = [];

    try {
        const requests = {
            refill: axios.get(`http://middleware:3001/medicine/get?patientId=${patientId}`),
            meds: axios.get(`http://middleware:3001/medicine/get?patientId=${patientId}`),
            //details: axios.get(`http://middleware:3001/medicine/details?patientId=${patientId}`)
        };

        const results = await Promise.allSettled(Object.values(requests));

        const responses = {
            refill: results[0],
            meds: results[1],
            //details: results[2]
        };

        // Log each response
        for (const [key, result] of Object.entries(responses)) {
            if (result.status === 'fulfilled') {
                console.log(`${key} response:`, result.value.data);
            } else {
                console.error(`${key} failed:`, result.reason.message, result.reason.response?.status);
            }
        }

        // Assign data even if some requests fail
        refillAlerts = responses.refill.status === 'fulfilled' ? responses.refill.value.data.filter(med => {
            const endDate = new Date(med.endDate);
            const daysLeft = (endDate - currentDate) / (1000 * 60 * 60 * 24);
            return med.inventory <= 5 || daysLeft <= 7;
        }) : [];

        const allMedications = responses.meds.status === 'fulfilled' ? responses.meds.value.data : [];
        // medicationDetails = responses.details.status === 'fulfilled' ? responses.details.value.data : [];
        currentMedications = allMedications.filter(med => new Date(med.endDate) >= currentDate);

        res.render('pages/caretaker/caretaker-dashboard', {
            isLoggedIn,
            userName: "Caretaker",
            refillAlerts,
            currentMedications
        });
    } catch (error) {
        console.error('Error loading caretaker dashboard:', error.message);
        res.status(500).send('Failed to load caretaker dashboard');
    }
});


// Patient dashboard
app.get('/patient-dashboard', authenticateUser, async (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    const userId = req.userId;
    console.log('Rendering patient dashboard for user:', userId, 'with role:', req.role);

    const currentDate = new Date(); // Use current date dynamically
    let refillAlerts = [], currentMedications = [], reminders = [], medicineHistory = [], caretakers = [], medicationDetails = [];

    try {
        const requests = {
            refill: axios.get(`http://middleware:3001/medicine/get?patientId=${userId}`),
            meds: axios.get(`http://middleware:3001/medicine/get?patientId=${userId}`),
            reminders: axios.get(`http://middleware:3001/reminders/${userId}`),
            history: axios.get(`http://middleware:3001/medicine/history?patientId=${userId}`),
            caretakers: axios.get(`http://middleware:3001/caretaker/get?patientId=${userId}`),
            details: axios.get(`http://middleware:3001/medicine/details?patientId=${userId}`)
        };

        const results = await Promise.allSettled(Object.values(requests));

        const responses = {
            refill: results[0],
            meds: results[1],
            reminders: results[2],
            history: results[3],
            caretakers: results[4],
            details: results[5]
        };

        // Log each response
        for (const [key, result] of Object.entries(responses)) {
            if (result.status === 'fulfilled') {
                console.log(`${key} response:`, result.value.data);
            } else {
                console.error(`${key} failed:`, result.reason.message, result.reason.response?.status);
            }
        }

        // Assign data even if some requests fail
        refillAlerts = responses.refill.status === 'fulfilled' ? responses.refill.value.data.filter(med => {
            const endDate = new Date(med.endDate);
            const daysLeft = (endDate - currentDate) / (1000 * 60 * 60 * 24);
            return med.inventory <= 5 || daysLeft <= 7;
        }) : [];

        const allMedications = responses.meds.status === 'fulfilled' ? responses.meds.value.data : [];
        currentMedications = allMedications.filter(med => new Date(med.endDate) >= currentDate);
        reminders = responses.reminders.status === 'fulfilled' ? responses.reminders.value.data.reminders || [] : [];
        medicineHistory = responses.history.status === 'fulfilled' ? responses.history.value.data : [];
        caretakers = responses.caretakers.status === 'fulfilled' ? responses.caretakers.value.data : [];
        medicationDetails = responses.details.status === 'fulfilled' ? responses.details.value.data : [];

        console.log('Current Date:', currentDate.toISOString()); // Log the current date for debugging
        console.log('Current Medications:', currentMedications);

        res.render('pages/patient/patient-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            refillAlerts,
            currentMedications,
            reminders,
            medicineHistory,
            caretakers,
            medicationDetails
        });
    } catch (error) {
        console.error('Unexpected error in patient dashboard:', error.message);
        res.render('pages/patient/patient-dashboard', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            error: 'Failed to load dashboard data',
            refillAlerts,
            currentMedications,
            reminders,
            medicineHistory,
            caretakers,
            medicationDetails
        });
    }
});

// Patient profile
app.get('/patient-profile', authenticateUser, (req, res) => {
    console.log('Rendering patient-profile page for user:', req.userId); // Log render attempt

    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/patient/patient-profile', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
        role: req.role
    });
});

// -----------------------------------------
// Medication Routes
// -----------------------------------------

// Add medicines page
app.get('/add-medicines', authenticateUser, (req, res) => {
    console.log('Rendering add-medicines page for user:', req.userId); // Log render attempt

    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/medicines/add-medicines', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
        role: req.role,
    });
});

// Add medicine
app.post('/add-medicines', authenticateUser, async (req, res) => {
    const { name, dosage, frequency, prescribingDoctor, endDate, inventory } = req.body;
    const patientId = req.userId;
    const organizationId = req.organizationId || null;
    console.log('Adding new medicine:', { patientId, name, dosage, frequency, prescribingDoctor, endDate, inventory, organizationId }); // Log request data
    // TODO: Sanitize name, prescribingDoctor, etc.

    try {
        const response = await axios.post('http://middleware:3001/medicine/add', {
            patientId,
            name,
            dosage: Number(dosage),
            frequency,
            prescribingDoctor,
            endDate,
            inventory: Number(inventory),
            organizationId
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Medicine added successfully:', response.data); // Log success
        res.redirect('/medication-profile');
    } catch (error) {
        console.error('Error adding medicine:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        }); // Log detailed error
        res.render('pages/medicines/add-medicines', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            error: error.response?.data?.error || 'Failed to add medicine'
        });
    }
});

// Medication profile
app.get('/medication-profile', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medication-profile page for user:', patientId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/medicine/get', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/medicines/medication-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medications:', error.message); // Log error
        res.render('pages/medicines/medication-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load active medications'
        });
    }
});

// Medicine details
app.get('/medicine-details', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medicine details page for user:', patientId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/medicine/details', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/medicines/medicine-details', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medicine details:', error.message); // Log error
        res.render('pages/medicines/medicine-details', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load Medicine details'
        });
    }
});

// Update medicine
app.post('/medicines/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, dosage, frequency, prescribingDoctor, endDate, inventory } = req.body;
    const patientId = req.userId;

    console.log('Updating medicine:', { id, patientId, name, dosage, frequency, prescribingDoctor, endDate, inventory }); // Log request data
    // TODO: Sanitize inputs

    try {
        const response = await axios.post('http://middleware:3001/medicine/update', {
            id,
            patientId,
            name,
            dosage,
            frequency,
            prescribingDoctor,
            endDate,
            inventory
        });
        res.status(200).json({ message: 'Medicine updated successfully' });
    } catch (error) {
        console.error('Error updating medicine:', error.message); // Log error
        res.status(500).json({ error: 'Failed to update medicine' });
    }
});

// Delete medicine
app.delete('/medicines/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const patientId = req.userId;

    console.log('Deleting medicine:', { id, patientId }); // Log request

    try {
        const response = await axios.delete('http://middleware:3001/medicine/delete', {
            data: { id, patientId }
        });
        res.status(200).json({ message: 'Medicine deleted successfully' });
    } catch (error) {
        console.error('Error deleting medicine:', error.message); // Log error
        res.status(500).json({ error: 'Failed to delete medicine' });
    }
});

// Medication history
app.get('/medication-history', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medication-history page for user:', patientId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/medicine/history', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/medicines/medication-history', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medication history:', error.message); // Log error
        res.render('pages/medicines/medication-history', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load medication history'
        });
    }
});

// Refill alerts
app.get('/refill-alerts', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    const currentDate = new Date('2025-03-10');

    console.log('Rendering refill-alert page for user:', patientId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/medicine/get', {
            params: { patientId }
        });
        const medications = response.data.map(med => calculateRefillAnalytics(med, currentDate));

        res.render('pages/alerts/refill-alerts', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medications:', error.message); // Log error
        res.render('pages/alerts/refill-alerts', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load active medications'
        });
    }
});

// -----------------------------------------
// Caretaker Routes
// -----------------------------------------

// Caretaker profile
app.get('/caretaker-profile', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering caretaker-profile page for user:', patientId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/caretaker/get', {
            params: { patientId }
        });
        const caretakers = response.data;

        res.render('pages/caretaker/caretaker-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            caretakers: caretakers
        });
    } catch (error) {
        console.error('Error fetching caretakers for profile:', error.message); // Log error
        res.render('pages/caretaker/caretaker-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            caretakers: [],
            error: 'Failed to load caretakers'
        });
    }
});

// Add caretaker page
app.get('/add-caretaker', authenticateUser, (req, res) => {
    console.log('Rendering add-caretaker page for user:', req.userId); // Log render attempt
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/caretaker/add-caretaker', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
        role: req.role
    });
});

// Add new caretaker
app.post('/new-caretaker', authenticateUser, (req, res) => {
    const { name, relation, email, phone } = req.body;
    const patientId = req.userId;
    console.log('New Caretaker Added:', { patientId, name, relation, email, phone }); // Log request data
    // TODO: Sanitize inputs

    axios.post('http://middleware:3001/caretaker/add', { patientId, name, relation, email, phone })
        .then(() => {
            res.redirect('/caretaker-profile');
        })
        .catch((error) => {
            console.error('Error adding caretaker:', error.message); // Log error
            res.status(500).json({ error: 'Failed to add caretaker' });
        });
});

// Update caretaker
app.post('/caretakers/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, relation, phone, email } = req.body;
    const patientId = req.userId;

    console.log('Updating caretaker:', { id, patientId, name, relation, phone, email }); // Log request data
    // TODO: Sanitize inputs

    try {
        const response = await axios.post('http://middleware:3001/caretaker/update', {
            id,
            patientId,
            name,
            relation,
            phone,
            email
        });
        res.status(200).json({ message: 'Caretaker updated successfully' });
    } catch (error) {
        console.error('Error updating caretaker:', error.message); // Log error
        res.status(500).json({ error: 'Failed to update caretaker' });
    }
});

// Delete caretaker
app.delete('/caretakers/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const patientId = req.userId;

    console.log('Deleting caretaker:', { id, patientId }); // Log request

    try {
        const response = await axios.delete('http://middleware:3001/caretaker/delete', {
            data: { id, patientId }
        });
        res.status(200).json({ message: 'Caretaker deleted successfully' });
    } catch (error) {
        console.error('Error deleting caretaker:', error.message); // Log error
        res.status(500).json({ error: 'Failed to delete caretaker' });
    }
});

// -----------------------------------------
// Reminder Routes
// -----------------------------------------

// Add reminder page
app.get('/add-reminder', authenticateUser, (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering add-reminder page for user:', req.userId); // Log render attempt

    res.render('pages/reminder/add-reminder', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
        role: req.role
    });
});

// Add reminder
app.post('/add-reminder', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { title, description, datetime } = req.body;

    console.log('Adding reminder for user:', { userId, title, description, datetime }); // Log request data
    // TODO: Sanitize title and description

    try {
        const response = await axios.post('http://middleware:3001/reminders', {
            userId,
            title,
            description,
            datetime
        });

        if (response.status === 201) {
            res.redirect('/timely-reminders');
        }
    } catch (error) {
        console.error('Error adding reminder:', error.message); // Log error
        res.render('pages/reminder/add-reminder', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            error: 'Failed to add reminder'
        });
    }
});

// Timely reminders
app.get('/timely-reminders', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering timely-reminders page for user:', userId); // Log render attempt

    try {
        const response = await axios.get(`http://middleware:3001/reminders/${userId}`);
        const reminders = response.data.reminders || [];

        res.render('pages/reminder/timely-reminders', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            userId: userId,
            reminders: reminders
        });
    } catch (error) {
        console.error('Error fetching reminders:', error.message); // Log error
        res.render('pages/reminder/timely-reminders', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            userId: userId,
            reminders: [],
            error: 'Failed to load reminders'
        });
    }
});

// Update reminder
app.put('/reminders/:reminderId', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { reminderId } = req.params;
    const { title, description, datetime, completed } = req.body;

    console.log('Updating reminder:', { reminderId, userId, title, description, datetime, completed }); // Log request data
    // TODO: Sanitize inputs

    try {
        const response = await axios.put(`http://middleware:3001/reminders/${reminderId}`, {
            userId,
            title,
            description,
            datetime,
            completed
        });
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error updating reminder:', error.message); // Log error
        res.status(error.response?.status || 500).send('Failed to update reminder');
    }
});

// Delete reminder
app.delete('/reminders/:reminderId', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { reminderId } = req.params;

    console.log('Deleting reminder:', { reminderId, userId }); // Log request

    try {
        const response = await axios.delete(`http://middleware:3001/reminders/${reminderId}`, {
            data: { userId }
        });
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error deleting reminder:', error.message); // Log error
        res.status(error.response?.status || 500).send('Failed to delete reminder');
    }
});

// -----------------------------------------
// Authentication Routes
// -----------------------------------------

// Login
app.post('/login', async (req, res) => {
    try {
        const response = await axios.post('http://middleware:3001/auth/login', req.body, {
            withCredentials: true,
        });

        console.log('Middleware response:', response.data); // Log middleware response

        res.cookie('authToken', response.data.token, {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });

        console.log('Cookie set successfully:', response.data.token); // Log cookie setting

        const userRole = response.data.role;
        if (userRole === 'user') {
            console.log('Redirecting user to /patient-dashboard'); // Log redirect
            res.redirect('/patient-dashboard');
        } else if (userRole === 'admin') {
            console.log('Redirecting admin to /admin-dashboards'); // Log redirect
            res.redirect('/admin-dashboard');
        } else if (userRole === 'owner') {
            console.log('Redirecting admin to /owner-dashboards'); // Log redirect
            res.redirect('/owner-dashboard');
        } else {
            console.log('Redirecting to default /'); // Log redirect
            res.redirect('/');
        }
    } catch (error) {
        console.error('Login error:', error.message); // Log error
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error || 'Login failed',
        });
    }
});

// Caretaker login
app.post('/login-caretaker', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('Caretaker login request received:', req.body);

        const response = await axios.post('http://middleware:3001/auth/caretaker-login', { email, password });

        const { patientId, caretakerName } = response.data;

        // Set patientId in cookie (you can also add caretaker name if needed)
        res.cookie('patientId', patientId, {
            httpOnly: true,
            secure: false, // Set to true if using HTTPS
            sameSite: 'Lax',
            path: '/',
        });

        console.log('Caretaker logged in, patientId set:', patientId);
        res.redirect('/caretaker-dashboard'); // Your caretaker dashboard route
    } catch (error) {
        console.error('Caretaker login error:', error.message);
        res.status(401).render('pages/auth/sign-in-caretaker', {
            error: 'Invalid email or token'
        });
    }
});

// Logout
app.post('/logout', (req, res) => {
    console.log('Logout request received'); // Log request

    try {
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });

        res.clearCookie('patientId', {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });

        console.log('Cookie cleared successfully'); // Log cookie clear
        res.status(200).json({ message: 'Signed out successfully' });
    } catch (error) {
        console.error('Error during logout:', error); // Log error
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

// Register (general)
app.post('/register', async (req, res) => {
    console.log('Register request received:', req.body); // Log request data
    // TODO: Sanitize req.body inputs

    try {
        const response = await axios.post('http://middleware:3001/auth/register', req.body, {
            withCredentials: true,
        });

        console.log('Middleware response:', response.data); // Log response
        res.json(response.data);
    } catch (error) {
        console.error('Registration error:', error.message); // Log error
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || 'Registration failed',
        });
    }
});

// Register admin
app.post('/register-admin', async (req, res) => {
    const { name, email, phone, password, organizationId } = req.body;
    console.log('Admin signup request received:', req.body); // Log request data
    // TODO: Sanitize inputs

    try {
        const response = await axios.post('http://middleware:3001/auth/register-admin', {
            name,
            email,
            phone,
            password,
            organizationId,
            role: 'admin'
        });

        res.json({ message: 'Registration successful' });
    } catch (error) {
        console.error('Error registering admin:', error.message); // Log error
        res.status(error.response?.status || 500).json({ error: 'Registration failed' });
    }
});

// Password reset
app.post("/reset-password", async (req, res) => {
    console.log('Password reset request received:', req.body); // Log request data
    // TODO: Sanitize req.body

    try {
        const response = await axios.post("http://middleware:3001/auth/request-password-reset", req.body, { withCredentials: true });
        console.log('Middleware response:', response.data); // Log response
        res.json(response.data);
    } catch (error) {
        console.error('Password reset error:', error.message); // Log error
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Password Reset failed" });
    }
});

// Settings page
app.get('/settings', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering settings page for user:', userId); // Log render attempt

    try {
        const response = await axios.get('http://middleware:3001/auth/user', {
            params: { userId }
        });
        const user = response.data;

        res.render('pages/auth/settings', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            user: { userId, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Error fetching user data:', error.message); // Log error
        res.render('pages/auth/settings', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            user: null,
            error: 'Failed to load user data'
        });
    }
});

// Update settings
app.post('/settings/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, email, password, currentPassword } = req.body;
    const userId = req.userId;

    if (id !== userId) {
        return res.status(403).json({ error: 'Unauthorized to update this user' });
    }

    console.log('Updating settings:', { id, name, email, password: password || 'unchanged', currentPassword: currentPassword || 'not provided' }); // Log request data
    // TODO: Sanitize inputs

    try {
        const updateResponse = await axios.post('http://middleware:3001/auth/update', {
            userId,
            name,
            email,
            password,
            currentPassword: password ? currentPassword : undefined
        });

        const userResponse = await axios.get('http://middleware:3001/auth/user', {
            params: { userId }
        });
        const updatedUser = userResponse.data;

        const newToken = jwt.sign(
            { userId: userId, email: updatedUser.email, name: updatedUser.name, organizationId: updatedUser.organizationId },
            SECRET_KEY,
            { expiresIn: '1h' }
        );

        res.cookie('authToken', newToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });
        console.log('Cookie refreshed with new token:', newToken); // Log cookie refresh

        res.status(200).json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error.message); // Log error
        res.status(error.response?.status || 500).json({ error: error.response?.data?.error || 'Failed to update settings' });
    }
});

// -----------------------------------------
// Server Start
// -----------------------------------------

// Start the server
app.listen(port, () => {
    console.log(`Frontend running on http://localhost:${port}`); // Log server start
});