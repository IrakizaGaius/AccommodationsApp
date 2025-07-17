require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { swaggerUi, swaggerSpec } = require('./swagger');

const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const viewingRequestRoutes = require('./routes/requests');
const reviewRoutes = require('./routes/reviews');
const savedPropertyRoutes = require('./routes/savedProperties');
const messageRoutes = require('./routes/messages');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} = require('./utils/auth');

const prisma = new PrismaClient();
const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

const PORT = process.env.PORT || 4000;

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await prisma.user.findUnique({
      where: { googleId: profile.id },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.emails[0].value,
          name: profile.displayName,
          googleId: profile.id,
          emailVerified: true,
          role: 'student',
        },
      });
    }
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});
// Swagger route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Mount auth routes
app.use('/auth', authRoutes);
// Mount property routes
app.use('/properties', propertyRoutes);
// Mount viewing request routes
app.use('/viewing-requests', viewingRequestRoutes);
// Mount review routes
app.use('/reviews', reviewRoutes);
// Mount saved properties routes
app.use('/saved-properties', savedPropertyRoutes);
// Mount message routes
app.use('/chat', messageRoutes);


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
