FROM node:20-bullseye-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Run database migration to ensure schema is up to date
RUN npx prisma migrate deploy

# Expose the port the app runs on
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
