const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or 'smtp.example.com' for other providers
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(to, token) {
  const verifyUrl = `${process.env.EMAIL_VERIFY_URL}${token}`;
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Verify your email address',
    html: `
      <h2>Welcome to Accommodations App!</h2>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${verifyUrl}">${verifyUrl}</a>
      <p>This link will expire in 15 minutes.</p>
    `,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail };
