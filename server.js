const express = require('express'); // Import Express
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express(); // Initialize Express app
const port = process.env.PORT || 3000; // Define the port number

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===================== Authentication Routes ===================== //

// Route for the home/sign-in page
app.get('/login-page', (req, res) => {
  res.render('pages/login_test', { error: null });
});

// Route for the home/sign-in page
app.get('/', (req, res) => {
  res.render('pages/index');
});

// Authentication Routes
app.get('/sign-in', (req, res) => res.render('pages/auth/sign-in'));
app.get('/sign-up', (req, res) => res.render('pages/auth/sign-up'));
app.get('/recover-password', (req, res) => res.render('pages/auth/recover-password'));
app.get('/lock-screen', (req, res) => res.render('pages/auth/lock-screen'));
app.get('/confirm-mail', (req, res) => res.render('pages/auth/confirm-mail'));

// ===================== Dashboard Routes ===================== //

app.get('/dashboard', (req, res) => res.render('pages/dashboard/dashboard'));
app.get('/dummy', (req, res) => res.render('pages/dashboard/dummy'));
app.get('/dashboard-1', (req, res) => res.render('pages/dashboard/dashboard-1'));
app.get('/add-guardian', (req, res) => res.render('pages/dashboard/add-guardian'));
app.get('/add-medicines', (req, res) => res.render('pages/dashboard/add-medicines'));
app.get('/guardian-profile', (req, res) => res.render('pages/dashboard/guardian-profile'));
app.get('/patient-profile', (req, res) => res.render('pages/dashboard/patient-profile'));
app.get('/refill-alerts', (req, res) => res.render('pages/dashboard/refill-alerts'));

// Route for adding a patient
app.get('/dashboard/add-patient', (req, res) => {
  res.render('pages/dashboard/add-patient');
});

// Route for handling patient form submission
app.post('/dashboard/add-patient', (req, res) => {
  const { patientName, dob, gender, medicalHistory, guardianName, guardianRelation, guardianPhone } = req.body;

  console.log('New Patient Added:', req.body); // Logs data for testing

  // In a real application, you would save this data to Firebase or another database
  // Example: db.collection('patients').add({ patientName, dob, gender, ... })

  res.redirect('/dashboard'); // Redirect to dashboard after submission
});



// Route to render Add Guardian Page
app.get('/dashboard/add-guardian', (req, res) => {
  res.render('pages/dashboard/add-guardian');
});

// Route for handling Guardian Form Submission
app.post('/dashboard/add-guardian', (req, res) => {
  const { guardianName, relation, email, phone, address } = req.body;

  console.log('New Guardian Added:', req.body); // Logs data for testing

  // In a real application, you would save this data to Firebase or another database
  // Example: db.collection('guardians').add({ guardianName, relation, email, phone, address })

  res.redirect('/dashboard'); // Redirect to dashboard after submission
});


// ===================== Extra Pages Routes ===================== //
app.get('/privacy-policy', (req, res) => res.render('pages/extra/privacy-policy'));
app.get('/terms-of-service', (req, res) => res.render('pages/extra/terms-of-service'));


// Login Route (Calls Middleware)
app.post('/login', async (req, res) => {
  try {
    const response = await axios.post('http://middleware:5000/auth/login', req.body, { withCredentials: true });

    // Set the JWT token from middleware response
    res.cookie('authToken', response.data.token, { httpOnly: true, secure: true, sameSite: 'Strict' });

    res.redirect('/dashboard-1');
  } catch (error) {
    res.render('pages/login_test', { error: "Invalid username or password" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const response = await axios.post("http://middleware:5000/auth/register", req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Registration failed" });
  }
});

app.listen(port, () => {
  console.log(`Frontend running on http://localhost:${port}`);
});