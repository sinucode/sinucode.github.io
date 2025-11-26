# Base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy all files (we'll install at runtime)
COPY . .

# Expose port
EXPOSE 5173

# Install dependencies and start dev server at runtime
CMD ["sh", "-c", "npm install && npm run dev -- --host"]
