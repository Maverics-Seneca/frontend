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

// Debug: Log incoming requests
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    console.log('Cookies:', req.cookies); // Log cookies for debugging
    next();
});

// Authentication middleware
const authenticateUser = (req, res, next) => {
    const token = req.cookies.authToken; // Extract the authToken cookie
    console.log('Token from cookie:', token); // Debug: Log the token

    if (!token) {
        console.log('No token found, redirecting to home.'); // Debug: No token
        return res.render('pages/index', {
            isLoggedIn: false,
            message: 'Kindly sign in before accessing this page.', // Pass a message to the client
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // Verify the token
        req.userId = decoded.userId;
        req.email = decoded.email;
        req.name = decoded.name;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message); // Debug: Token verification error
        res.clearCookie('authToken'); // Clear invalid token
        return res.render('pages/index', {
            isLoggedIn: false,
            message: 'Session expired. Please sign in again.', // Pass a message to the client
        });
    }
};


//GET Routes
app.get('/', (req, res) => {
    console.log('Rendering home page. Is logged in:', !!req.cookies.authToken); // Debug: Log login status

    let userName = null;
    if (req.cookies.authToken) {
        try {
            const decoded = jwt.verify(req.cookies.authToken, SECRET_KEY);
            userName = decoded.name; // Extract the user's name from the token
        } catch (error) {
            console.error('Token verification failed:', error.message);
            res.clearCookie('authToken'); // Clear invalid token
        }
    }

    res.render('pages/index', {
        isLoggedIn: !!req.cookies.authToken, // Boolean indicating if the user is logged in
        userName: userName, // Pass the user's name to the template
    });
});

app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up'));
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
        userName: req.name, // Pass the user's name to the template
    });
});

app.get('/add-medicines', authenticateUser, (req, res) => {
    console.log('Rendering add-medicines page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/add-medicines', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name, // Pass the user's name to the template
    });
});

app.get('/refill-alerts', authenticateUser, (req, res) => {
    console.log('Rendering refill-alerts page for user:', req.userId); // Debug: Log user ID
    let medications = []; 
    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/refill-alerts', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name,
        medications // Pass the user's name to the template
    });
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
            caretakers: caretakers // Pass caretakers to the template
        });
    } catch (error) {
        console.error('Error fetching caretakers for profile:', error.message);
        // Render with an empty array if fetching fails
        res.render('pages/dashboard/caretaker-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
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
        userName: req.name, // Pass the user's name to the template
    });
});

app.get('/add-patient', authenticateUser, (req, res) => {
    console.log('Rendering add-patient page for user:', req.userId); // Debug: Log user ID

    // Check if the user is logged in
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/add-patient', {
        isLoggedIn: isLoggedIn, // Pass the login status to the template
        userName: req.name, // Pass the user's name to the template
    });
});

app.get('/add-caretaker', authenticateUser, (req, res) => {
    console.log('Rendering add-caretaker page for user:', req.userId);
    const isLoggedIn = !!req.cookies.authToken;

    res.render('pages/dashboard/add-caretaker', {
        isLoggedIn: isLoggedIn,
        userName: req.name,
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
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medications:', error.message);
        res.render('pages/dashboard/medication-profile', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
            medications: [],
            error: 'Failed to load active medications'
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
            medications: medications
        });
    } catch (error) {
        console.error('Error fetching medication history:', error.message);
        res.render('pages/dashboard/medication-history', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
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
            user: { userId, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Error fetching user data:', error.message);
        res.render('pages/auth/settings', {
            isLoggedIn: isLoggedIn,
            userName: req.name,
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

// Start the server
app.listen(port, () => {
    console.log(`Frontend running on http://localhost:${port}`);
});