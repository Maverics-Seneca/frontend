const express = require('express'); // Import Express
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express(); // Initialize Express app
const port = process.env.PORT || 3000; // Define the port number
const SECRET_KEY = process.env.JWT_SECRET

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const authenticateUser = (req, res, next) => {
  const token = req.cookies.authToken; // Read JWT from cookies

  if (!token) {
    return res.redirect('/'); // Redirect to login if no token
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.userId;
    req.role = decoded.role;
    req.name = decoded.name;
    next();
  } catch (error) {
    res.clearCookie('authToken'); // Clear invalid token
    return res.redirect('/'); // Redirect to login
  }
};


// ===================== Authentication Routes ===================== //
// Route for the home/sign-in page
app.get('/', (req, res) => {
  console.log("Cookies:", req.cookies);
  const token = req.cookies.authToken; // Read JWT from cookies

  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      res.render('pages/index', {
        isLoggedIn: true,
        userName: decoded.name, // Pass the user's name from the decoded token
      });
    } catch (error) {
      // If the token is invalid, treat the user as not logged in
      res.clearCookie('authToken'); // Clear invalid token
      res.render('pages/index', {
        isLoggedIn: false,
      });
    }
  } else {
    // If no token, treat the user as not logged in
    res.render('pages/index', {
      isLoggedIn: false,
    });
  }
});

// Authentication Routes
app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up'));
app.get('/recover-password', (req, res) => res.render('pages/auth/recover-password'));
app.get('/lock-screen', (req, res) => res.render('pages/auth/lock-screen'));
app.get('/confirm-mail', (req, res) => res.render('pages/auth/confirm-mail'));

// ===================== Dashboard Routes ===================== //

app.get('/dashboard', authenticateUser, (req, res) => res.render('pages/dashboard/dashboard'));
app.get('/dummy', (req, res) => res.render('pages/dashboard/dummy'));
app.get('/dashboard-1', authenticateUser, (req, res) => res.render('pages/dashboard/dashboard-1'));
app.get('/add-guardian', authenticateUser, (req, res) => res.render('pages/dashboard/add-guardian'));
app.get('/add-medicines', authenticateUser, (req, res) => res.render('pages/dashboard/add-medicines'));
app.get('/guardian-profile', authenticateUser, (req, res) => res.render('pages/dashboard/guardian-profile'));
app.get('/patient-profile', authenticateUser, (req, res) => res.render('pages/dashboard/patient-profile'));
app.get('/refill-alerts', authenticateUser, (req, res) => res.render('pages/dashboard/refill-alerts'));


// ===================== Extra Pages Routes ===================== //
app.get('/privacy-policy', (req, res) => res.render('pages/extra/privacy-policy'));
app.get('/terms-of-service', (req, res) => res.render('pages/extra/terms-of-service'));
// ===================== Extra Pages Routes END ===================== //

// Route for adding a patient
app.get('/dashboard/add-patient', authenticateUser, (req, res) => {
  res.render('pages/dashboard/add-patient');
});

// Route for handling patient form submission
app.post('/dashboard/add-patient', authenticateUser, authenticateUser, (req, res) => {
  const { patientName, dob, gender, medicalHistory, guardianName, guardianRelation, guardianPhone } = req.body;

  console.log('New Patient Added:', req.body); // Logs data for testing

  // In a real application, you would save this data to Firebase or another database
  // Example: db.collection('patients').add({ patientName, dob, gender, ... })

  res.redirect('/dashboard'); // Redirect to dashboard after submission
});

// Route to render Add Guardian Page
app.get('/dashboard/add-guardian', authenticateUser, authenticateUser, (req, res) => {
  res.render('pages/dashboard/add-guardian');
});

// Route for handling Guardian Form Submission
app.post('/dashboard/add-guardian', authenticateUser, authenticateUser, (req, res) => {
  const { guardianName, relation, email, phone, address } = req.body;

  console.log('New Guardian Added:', req.body); // Logs data for testing

  // In a real application, you would save this data to Firebase or another database
  // Example: db.collection('guardians').add({ guardianName, relation, email, phone, address })

  res.redirect('/dashboard'); // Redirect to dashboard after submission
});

// Login Route (Calls Middleware)
app.post('/login', async (req, res) => {
  try {
    const response = await axios.post('http://middleware:5000/auth/login', req.body, { withCredentials: true });

    res.cookie('authToken', response.data.token, { httpOnly: true, sameSite: 'None' });

    res.redirect('/dashboard-1');
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Login failed" });
  }
});

// Frontend Server: Logout Route
app.post('/logout', (req, res) => {
  try {
    // Clear the authToken cookie
    res.clearCookie('authToken', { httpOnly: true, sameSite: 'None' });
    res.status(200).json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

app.post("/register", async (req, res) => {
  try {
    const response = await axios.post("http://middleware:5000/auth/register", req.body,{ withCredentials: true });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Registration failed" });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const response = await axios.post("http://middleware:5000/auth/request-password-reset", req.body, { withCredentials: true });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Password Reset failed" });
  }
});


app.listen(port, () => {
  console.log(`Frontend running on http://localhost:${port}`);
});