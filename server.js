const express = require('express'); // Import Express framework
const axios = require('axios');
const path = require('path');

const app = express(); // Create an Express application
const port = 3000; // Define the port number

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, JS, images, etc.) from the 'public' directory
app.use(express.static('public'));

// ===================== Authentication Routes ===================== //

// Route for the home/sign-in page
app.get('/login-page', (req, res) => {
  res.render('pages/login_test', { error: null });
});

// Route for the home/sign-in page
app.get('/', (req, res) => {
  res.render('pages/index');
});

// Route for the sign-in page
app.get('/sign-in', (req, res) => {
  res.render('pages/auth/sign-in');
});

// Route for the sign-up page
app.get('/sign-up', (req, res) => {
  res.render('pages/auth/sign-up');
});

// Route for the password recovery page
app.get('/recover-password', (req, res) => {
  res.render('pages/auth/recover-password');
});

// Route for the lock-screen page
app.get('/lock-screen', (req, res) => {
  res.render('pages/auth/lock-screen');
});

// Route for the email confirmation page
app.get('/confirm-mail', (req, res) => {
  res.render('pages/auth/confirm-mail');
});

// ===================== Dashboard Routes ===================== //

// Route to add a guardian
app.get('/add-guardian', (req, res) => {
  res.render('pages/dashboard/add-guardian');
});

// Route to add medicines
app.get('/add-medicines', (req, res) => {
  res.render('pages/dashboard/add-medicines');
});

// Route to add a patient
app.get('/add-patient', (req, res) => {
  res.render('pages/dashboard/add-patient');
});

// Route for an alternative dashboard view
app.get('/dashboard-1', (req, res) => {
  res.render('pages/dashboard/dashboard-1');
});

// Route for the main dashboard
app.get('/dashboard', (req, res) => {
  res.render('pages/dashboard/dashboard');
});

// Route for the guardian's profile page
app.get('/guardian-profile', (req, res) => {
  res.render('pages/dashboard/guardian-profile');
});

// Route for the patient's profile page
app.get('/patient-profile', (req, res) => {
  res.render('pages/dashboard/patient-profile');
});

// Route for refill alerts page
app.get('/refill-alerts', (req, res) => {
  res.render('pages/dashboard/refill-alerts');
});

// ===================== Extra Pages Routes ===================== //

// Route for the Privacy Policy page
app.get('/privacy-policy', (req, res) => {
  res.render('pages/extra/privacy-policy');
});

// Route for the Terms of Service page
app.get('/terms-of-service', (req, res) => {
  res.render('pages/extra/terms-of-service');
});

app.post('/login', async (req, res) => {
  try {
      const response = await axios.post('http://middleware:5000/auth/login', req.body);
      
      // Redirect to dashboard on successful login
      res.redirect('/dashboard-1');
  } catch (error) {
      res.render('pages/login_test', { error: "Invalid username or password" });
  }
});
// ===================== Start Server ===================== //
app.listen(port, () => {
  console.log(`Frontend running on http://localhost:${port}`);
});