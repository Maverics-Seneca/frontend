const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


//functions:
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

const authenticateUser = (req, res, next) => {
    console.log('authenticateUser running for:', req.method, req.url);
    const token = req.cookies.authToken;
    console.log('Token from cookie:', token);

    if (!token) {
        console.log('No token found, redirecting to home.');
        return res.render('pages/index', {
            isLoggedIn: false,
            message: 'Kindly sign in before accessing this page.',
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.userId;
        req.email = decoded.email;
        req.name = decoded.name;
        req.role = decoded.role;
        console.log('Decoded token:', decoded);
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        res.clearCookie('authToken');
        return res.render('pages/index', {
            isLoggedIn: false,
            message: 'Session expired. Please sign in again.',
        });
    }
};

// Debug: Log incoming requests
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    console.log(`Incoming role: ${req.role}`); // Runs BEFORE authenticateUser
    console.log('Cookies:', req.cookies);
    next();
});


//GET Routes
app.get('/', authenticateUser, (req, res) => {
    console.log('Rendering home page. Is logged in:', !!req.cookies.authToken);
    console.log('User role:', req.role);
    res.render('pages/index', {
        isLoggedIn: !!req.cookies.authToken,
        userName: req.name,
        role: req.role
    });
});

app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up'));
app.get('/sign-up-admin', (req, res) => res.render('pages/auth/sign-up-admin'));
app.get('/recover-password', (req, res) => res.render('pages/auth/recover-password'));
app.get('/lock-screen', (req, res) => res.render('pages/auth/lock-screen'));
app.get('/confirm-mail', (req, res) => res.render('pages/auth/confirm-mail'));
app.get('/privacy-policy', (req, res) => res.render('pages/extra/privacy-policy'));
app.get('/terms-of-service', (req, res) => res.render('pages/extra/terms-of-service'));

app.get('/dashboard', authenticateUser, (req, res) => {
    console.log('Rendering dashboard page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/dashboard', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name,
        role: req.role,
    });
});

app.get('/add-medicines', authenticateUser, (req, res) => {
    console.log('Rendering add-medicines page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/add-medicines', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name,
        role: req.role,
    });
});

// Render Refill-Alert page
app.get('/refill-alerts', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    const currentDate = new Date('2025-03-10'); // Hardcoded for testing

    console.log('Rendering refill-alert page for user:', patientId);

    try {
        const response = await axios.get('http://middleware:3001/medicine/get', {
            params: { patientId }
        });
        const medications = response.data.map(med => calculateRefillAnalytics(med, currentDate));

        res.render('pages/dashboard/refill-alerts', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medications:', error.message);
        res.render('pages/dashboard/refill-alerts', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load active medications'
        });
    }
});

app.get('/caretaker-profile', authenticateUser, async (req, res) => {
    const patientId = req.userId; // Extract patientId from authenticated user
    const isLoggedIn = !!req.cookies.authToken; // Check if user is logged in

    console.log('Rendering caretaker-profile page for user:', patientId); // Debug log

    try {
        // Forward the request to the middleware to get caretakers
        const response = await axios.get('http://middleware:3001/caretaker/get', {
            params: { patientId }
        });
        const caretakers = response.data;

        // Render the page with caretaker data
        res.render('pages/dashboard/caretaker-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            caretakers: caretakers // Pass caretakers to the template
        });
    } catch (error) {
        console.error('Error fetching caretakers for profile:', error.message);
        // Render with an empty array if fetching fails
        res.render('pages/dashboard/caretaker-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            caretakers: [],
            error: 'Failed to load caretakers'
        });
    }
});

app.get('/patient-profile', authenticateUser, (req, res) => {
    console.log('Rendering patient-profile page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/patient-profile', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name,
        role: req.role // Pass the user's name to the template
    });
});

// Add Organization page
app.get('/add-organization', authenticateUser, (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering add-organization page for user:', req.userId, 'with role:', req.role);

    // Check if the user has the 'admin' role
    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner');
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view Organizations.',
        });
    }

    res.render('pages/dashboard/add-organization', {
        isLoggedIn,
        userName: req.name,
        role: req.role,
        userId: req.userId
    });
});

app.post('/add-organization', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { name, description } = req.body;
    console.log('Add organization request received for user:', userId);

    // Check if the user has the 'admin' role
    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner');
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
        console.error('Error adding organization:', error.message);
        res.render('pages/dashboard/add-organization', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            userId: req.userId,
            error: 'Failed to add organization'
        });
    }
});

// Fetch all organizations for the user
app.get('/all-organizations', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering all-organizations page for user:', userId, 'with role:', req.role);

    // Check if the user has the 'owner' role
    if (req.role !== 'owner') {
        console.log('Access denied: User is not an Owner');
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view Organizations.',
        });
    }

    try {
        const response = await axios.get('http://middleware:3001/organization/get', {
            params: { userId }
        });
        const organizations = response.data;

        res.render('pages/dashboard/all-organizations', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations
        });
    } catch (error) {
        console.error('Error fetching organizations:', error.message);
        res.render('pages/dashboard/all-organizations', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            organizations: [],
            error: 'Failed to load organizations'
        });
    }
});

// Update Organization
app.put('/organization/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    console.log('Update organization request received for ID:', id);

    try {
        await axios.put(`http://middleware:3001/organization/${id}`, {
            userId: req.userId,
            name,
            description
        });
        res.status(200).send('Organization updated successfully');
    } catch (error) {
        console.error('Error updating organization:', error.message);
        res.status(error.response?.status || 500).send('Failed to update organization');
    }
});

// Delete Organization
app.delete('/organization/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    console.log('Delete organization request received for ID:', id);

    try {
        await axios.delete(`http://middleware:3001/organization/${id}`, {
            data: { userId: req.userId }
        });
        res.status(200).send('Organization deleted successfully');
    } catch (error) {
        console.error('Error deleting organization:', error.message);
        res.status(error.response?.status || 500).send('Failed to delete organization');
    }
});

app.get('/add-patient', authenticateUser, (req, res) => {
    console.log('Rendering add-patient page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    // Check if the user has the 'admin' role
    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin');
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view patients.',
        });
    }

    res.render('pages/dashboard/add-patient', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name,
        role: req.role // Pass the user's name to the template
    });
});

app.get('/add-caretaker', authenticateUser, (req, res) => {
    console.log('Rendering add-caretaker page for user:', req.userId);
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/add-caretaker', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
        role: req.role
    });
});

app.post('/caretakers/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, relation, phone, email } = req.body;
    const patientId = req.userId;

    console.log('Updating caretaker:', { id, patientId, name, relation, phone, email });

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
        console.error('Error updating caretaker:', error.message);
        res.status(500).json({ error: 'Failed to update caretaker' });
    }
});

// Delete a caretaker
app.delete('/caretakers/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const patientId = req.userId;

    console.log('Deleting caretaker:', { id, patientId });

    try {
        const response = await axios.delete('http://middleware:3001/caretaker/delete', {
            data: { id, patientId } // Send data in body for DELETE
        });
        res.status(200).json({ message: 'Caretaker deleted successfully' });
    } catch (error) {
        console.error('Error deleting caretaker:', error.message);
        res.status(500).json({ error: 'Failed to delete caretaker' });
    }
});

// POST Functions
app.post('/add-patient', authenticateUser, (req, res) => {
    // Check if the user has the 'admin' role
    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin');
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to add patients.',
        });
    }
    const { patientName, dob, gender, medicalHistory, guardianName, guardianRelation, guardianPhone } = req.body;
    console.log('New Patient Added:', req.body); // Debug: Log new patient data
    res.redirect('/dashboard');
});

app.post('/login',
    async (req, res) => {

        try {
            const response = await axios.post('http://middleware:3001/auth/login', req.body, {
                withCredentials: true,
            });

            console.log('Middleware response:', response.data); // Debug: Log middleware response

            // Set the authToken cookie
            res.cookie('authToken', response.data.token, {
                httpOnly: true,
                secure: false, // Ensure this is true in production (HTTPS only)
                sameSite: 'Lax', // Required for cross-origin cookies
                path: '/', // Cookie accessible across all paths
            });

            console.log('Cookie set successfully:', response.data.token); // Debug: Log cookie set
            res.redirect('/');
        } catch (error) {
            console.error('Login error:', error.message); // Debug: Log login error
            res.status(error.response?.status || 500).json({
                error: error.response?.data?.message || 'Login failed',
            });
        }
    });

app.post('/add-medicines', authenticateUser, async (req, res) => {
    const { name, dosage, frequency, prescribingDoctor, endDate, inventory } = req.body;
    const patientId = req.userId; // Extract patientId from authenticated user

    console.log('Adding new medicine:', { patientId, name, dosage, frequency, prescribingDoctor, endDate, inventory }); // Debug log

    try {
        const response = await axios.post('http://middleware:3001/medicine/add', {
            patientId,
            name,
            dosage: Number(dosage), // Convert to number
            frequency,
            prescribingDoctor,
            endDate,
            inventory: Number(inventory) // Convert to number
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Medicine added successfully:', response.data); // Debug log
        res.redirect('/medication-profile'); // Redirect on success
    } catch (error) {
        console.error('Error adding medicine:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.render('pages/dashboard/add-medicines', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            error: error.response?.data?.error || 'Failed to add medicine'
        });
    }
});

// Fetch all medications for the user
app.get('/medication-profile', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medication-profile page for user:', patientId);

    try {
        const response = await axios.get('http://middleware:3001/medicine/get', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/dashboard/medication-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medications:', error.message);
        res.render('pages/dashboard/medication-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load active medications'
        });
    }
});

// Fetch Medicine details for the user
app.get('/medicine-details', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medicine details page for user:', patientId);

    try {
        const response = await axios.get('http://middleware:3001/medicine/details', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/dashboard/medicine-details', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medicine details:', error.message);
        res.render('pages/dashboard/medicine-details', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load Medicine details'
        });
    }
});

// Logs pageI want logs to shows only if the role is admin page route
app.get('/logs', authenticateUser, async (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;
    console.log('Rendering logs page for user:', req.userId, 'with role:', req.role);

    // Check if the user has the 'admin' role
    if (req.role !== 'admin') {
        console.log('Access denied: User is not an admin');
        return res.status(403).render('pages/error', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            message: 'Access denied. You must be an admin to view logs.',
        });
    }

    try {
        const response = await axios.get('http://middleware:3001/logs');
        const logs = response.data;

        res.render('pages/dashboard/logs', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            logs,
        });
    } catch (error) {
        console.error('Error fetching logs:', error.message);
        res.render('pages/dashboard/logs', {
            isLoggedIn,
            userName: req.name,
            role: req.role,
            logs: [],
            error: 'Failed to load logs',
        });
    }
});

// Update a medicine
app.post('/medicines/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, dosage, frequency, prescribingDoctor, endDate, inventory } = req.body;
    const patientId = req.userId;

    console.log('Updating medicine:', { id, patientId, name, dosage, frequency, prescribingDoctor, endDate, inventory });

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
        console.error('Error updating medicine:', error.message);
        res.status(500).json({ error: 'Failed to update medicine' });
    }
});

// Delete a medicine
app.delete('/medicines/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const patientId = req.userId;

    console.log('Deleting medicine:', { id, patientId });

    try {
        const response = await axios.delete('http://middleware:3001/medicine/delete', {
            data: { id, patientId } // Send data in body for DELETE
        });
        res.status(200).json({ message: 'Medicine deleted successfully' });
    } catch (error) {
        console.error('Error deleting medicine:', error.message);
        res.status(500).json({ error: 'Failed to delete medicine' });
    }
});

// Fetch all expired medications for the user
app.get('/medication-history', authenticateUser, async (req, res) => {
    const patientId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering medication-history page for user:', patientId);

    try {
        const response = await axios.get('http://middleware:3001/medicine/history', {
            params: { patientId }
        });
        const medications = response.data;

        res.render('pages/dashboard/medication-history', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medication history:', error.message);
        res.render('pages/dashboard/medication-history', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            medications: [],
            error: 'Failed to load medication history'
        });
    }
});

app.post('/new-caretaker', authenticateUser, (req, res) => {
    const { name, relation, email, phone } = req.body;
    const patientId = req.userId; // Extract patientId from the authenticated request

    console.log('New Caretaker Added:', { patientId, name, relation, email, phone }); // Debug: Log new caretaker data

    // Forward the request to the middleware
    axios.post('http://middleware:3001/caretaker/add', { patientId, name, relation, email, phone })
        .then(() => {
            res.redirect('/caretaker-profile');
        })
        .catch((error) => {
            console.error('Error adding caretaker:', error.message);
            res.status(500).json({ error: 'Failed to add caretaker' });
        });
});

// Logout route
app.post('/logout', (req, res) => {
    console.log('Logout request received'); // Debug: Log logout request

    try {
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });

        console.log('Cookie cleared successfully'); // Debug: Log cookie cleared
        res.status(200).json({ message: 'Signed out successfully' });
    } catch (error) {
        console.error('Error during logout:', error); // Debug: Log logout error
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

// Register route
app.post('/register', async (req, res) => {
    console.log('Register request received:', req.body); // Debug: Log register request

    try {
        const response = await axios.post('http://middleware:3001/auth/register', req.body, {
            withCredentials: true,
        });

        console.log('Middleware response:', response.data); // Debug: Log middleware response
        res.json(response.data);
    } catch (error) {
        console.error('Registration error:', error.message); // Debug: Log registration error
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || 'Registration failed',
        });
    }
});

// Register route (for admin)
app.post('/register-admin', async (req, res) => {
    console.log('Register request received:', req.body);

    try {
        const response = await axios.post('http://middleware:3001/auth/register-admin', req.body, {
            withCredentials: true,
        });

        console.log('Middleware response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || 'Registration failed',
        });
    }
});

// Password reset route
app.post("/reset-password", async (req, res) => {
    console.log('Password reset request received:', req.body); // Debug: Log password reset request

    try {
        const response = await axios.post("http://middleware:3001/auth/request-password-reset", req.body, { withCredentials: true });
        console.log('Middleware response:', response.data); // Debug: Log middleware response
        res.json(response.data);
    } catch (error) {
        console.error('Password reset error:', error.message); // Debug: Log password reset error
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Password Reset failed" });
    }
});

// Settings page route 
app.get('/settings', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering settings page for user:', userId);

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
        console.error('Error fetching user data:', error.message);
        res.render('pages/auth/settings', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            user: null,
            error: 'Failed to load user data'
        });
    }
});

// Update settings route with cookie refresh
app.post('/settings/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, email, password, currentPassword } = req.body;
    const userId = req.userId;

    if (id !== userId) {
        return res.status(403).json({ error: 'Unauthorized to update this user' });
    }

    console.log('Updating settings:', { id, name, email, password: password || 'unchanged', currentPassword: currentPassword || 'not provided' });

    try {
        // Update user data, including currentPassword if provided
        const updateResponse = await axios.post('http://middleware:3001/auth/update', {
            userId,
            name,
            email,
            password,
            currentPassword: password ? currentPassword : undefined // Only send if password is changing
        });

        // Fetch updated user data to generate a new token
        const userResponse = await axios.get('http://middleware:3001/auth/user', {
            params: { userId }
        });
        const updatedUser = userResponse.data;

        // Generate a new token with updated user info
        const newToken = jwt.sign(
            { userId: userId, email: updatedUser.email, name: updatedUser.name },
            SECRET_KEY,
            { expiresIn: '1h' }
        );

        // Refresh the authToken cookie
        res.cookie('authToken', newToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
            path: '/',
        });
        console.log('Cookie refreshed with new token:', newToken);

        res.status(200).json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error.message);
        res.status(error.response?.status || 500).json({ error: error.response?.data?.error || 'Failed to update settings' });
    }
});

// Render Add Reminder page
app.get('/add-reminder', authenticateUser, (req, res) => {
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering add-reminder page for user:', req.userId);

    res.render('pages/dashboard/add-reminder', {
        isLoggedIn: isLoggedIn,
        userName: req.name
    });
});

// Handle Add Reminder form submission
app.post('/add-reminder', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { title, description, datetime } = req.body;

    console.log('Adding reminder for user:', { userId, title, description, datetime });

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
        console.error('Error adding reminder:', error.message);
        res.render('pages/dashboard/add-reminder', {
            isLoggedIn: !!req.cookies.authToken,
            userName: req.name,
            role: req.role,
            error: 'Failed to add reminder'
        });
    }
});

// Render Timely Reminders page
app.get('/timely-reminders', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const isLoggedIn = !!req.cookies.authToken;

    console.log('Rendering timely-reminders page for user:', userId);

    try {
        const response = await axios.get(`http://middleware:3001/reminders/${userId}`);
        const reminders = response.data.reminders || [];

        res.render('pages/dashboard/timely-reminders', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            userId: userId, // Pass userId to EJS
            reminders: reminders
        });
    } catch (error) {
        console.error('Error fetching reminders:', error.message);
        res.render('pages/dashboard/timely-reminders', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            role: req.role,
            userId: userId,
            reminders: [],
            error: 'Failed to load reminders'
        });
    }
});

// Update a Reminder
app.put('/reminders/:reminderId', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { reminderId } = req.params;
    const { title, description, datetime, completed } = req.body;

    console.log('Updating reminder:', { reminderId, userId, title, description, datetime, completed });

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
        console.error('Error updating reminder:', error.message);
        res.status(error.response?.status || 500).send('Failed to update reminder');
    }
});

// Delete a Reminder
app.delete('/reminders/:reminderId', authenticateUser, async (req, res) => {
    const userId = req.userId;
    const { reminderId } = req.params;

    console.log('Deleting reminder:', { reminderId, userId });

    try {
        const response = await axios.delete(`http://middleware:3001/reminders/${reminderId}`, {
            data: { userId } // Send userId in body for DELETE
        });
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error deleting reminder:', error.message);
        res.status(error.response?.status || 500).send('Failed to delete reminder');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Frontend running on http://localhost:${port}`);
});