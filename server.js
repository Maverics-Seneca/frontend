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
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // Verify the token
        console.log('Decoded token:', decoded); // Debug: Log decoded token
        req.userId = decoded.userId;
        req.email = decoded.email;
        req.name = decoded.name;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message); // Debug: Token verification error
        res.clearCookie('authToken'); // Clear invalid token
        return res.redirect('/');
    }
};

// Routes
app.get('/', (req, res) => {
    console.log('Rendering home page. Is logged in:', !!req.cookies.authToken); // Debug: Log login status
    res.render('pages/index', { isLoggedIn: !!req.cookies.authToken });
});

app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up'));
app.get('/recover-password', (req, res) => res.render('pages/auth/recover-password'));
app.get('/lock-screen', (req, res) => res.render('pages/auth/lock-screen'));
app.get('/confirm-mail', (req, res) => res.render('pages/auth/confirm-mail'));

app.get('/dashboard', authenticateUser, (req, res) => res.render('pages/dashboard/dashboard'));
app.get('/dummy', (req, res) => res.render('pages/dashboard/dummy'));
app.get('/dashboard-1', authenticateUser, (req, res) => res.render('pages/dashboard/dashboard-1'));
app.get('/add-guardian', authenticateUser, (req, res) => res.render('pages/dashboard/add-guardian'));
app.get('/add-medicines', authenticateUser, (req, res) => res.render('pages/dashboard/add-medicines'));
app.get('/guardian-profile', authenticateUser, (req, res) => res.render('pages/dashboard/guardian-profile'));
app.get('/patient-profile', authenticateUser, (req, res) => res.render('pages/dashboard/patient-profile'));
app.get('/refill-alerts', authenticateUser, (req, res) => res.render('pages/dashboard/refill-alerts'));

app.get('/privacy-policy', (req, res) => res.render('pages/extra/privacy-policy'));
app.get('/terms-of-service', (req, res) => res.render('pages/extra/terms-of-service'));

app.get('/dashboard/add-patient', authenticateUser, (req, res) => {
    console.log('Rendering add-patient page for user:', req.userId); // Debug: Log user ID
    res.render('pages/dashboard/add-patient');
});

app.post('/dashboard/add-patient', authenticateUser, (req, res) => {
    const { patientName, dob, gender, medicalHistory, guardianName, guardianRelation, guardianPhone } = req.body;
    console.log('New Patient Added:', req.body); // Debug: Log new patient data
    res.redirect('/dashboard');
});

app.get('/dashboard/add-guardian', authenticateUser, (req, res) => {
    console.log('Rendering add-guardian page for user:', req.userId); // Debug: Log user ID
    res.render('pages/dashboard/add-guardian');
});

app.post('/dashboard/add-guardian', authenticateUser, (req, res) => {
    const { guardianName, relation, email, phone, address } = req.body;
    console.log('New Guardian Added:', req.body); // Debug: Log new guardian data
    res.redirect('/dashboard');
});

app.post('/login', async (req, res) => {
  
  try {
      const response = await axios.post('http://middleware:3001/auth/login', req.body, {
          withCredentials: true,
      });

      console.log('Middleware response:', response.data); // Debug: Log middleware response

      // Set the authToken cookie
      res.cookie('authToken', response.data.token, {
          httpOnly: true,
          secure: true, // Ensure this is true in production (HTTPS only)
          sameSite: 'None', // Required for cross-origin cookies
          path: '/', // Cookie accessible across all paths
      });

      console.log('Cookie set successfully:', response.data.token); // Debug: Log cookie set
      res.redirect('/dashboard-1');
  } catch (error) {
      console.error('Login error:', error.message); // Debug: Log login error
      res.status(error.response?.status || 500).json({
          error: error.response?.data?.message || 'Login failed',
      });
  }
});

// Logout route
app.post('/logout', (req, res) => {
    console.log('Logout request received'); // Debug: Log logout request

    try {
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
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

// Start the server
app.listen(port, () => {
    console.log(`Frontend running on http://localhost:${port}`);
});