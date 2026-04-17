# 🚀 Project Setup Guide

This project uses Docker to support both **development** and **production** environments.

No local Node.js installation is required.

---

# 📦 Prerequisites

Ensure the following are installed on your system:

- Docker
- Docker Compose (v2+)

---

# 🧪 Development Environment

The development environment is optimized for active coding with hot reload enabled.

## ▶ Start Development Server

```bash
docker compose -f docker-compose.dev.yml up --build
```

## 🌐 Access Application
http://localhost:3000

## ✨ Features
- Hot reload (Fast Refresh enabled)
- Live code updates without rebuilding
- Mounted source code for real-time development
- Simplified debugging workflow

## 🛑 Stop Development Server
```bash
CTRL + C
```
or
```bash
docker compose -f docker-compose.dev.yml down
```

# 🚀 Production Environment

The production environment is optimized for performance and stability.

## ▶ Build and Run Production Container
```bash
docker compose -f docker-compose.prod.yml up --build -d
```

## 🌐 Access Application
http://localhost:3000

## 🛑 Stop Production Server
```bash
docker compose -f docker-compose.prod.yml down
```

# ❗ Important Notes
- Development and production environments are fully isolated
- Always use development mode for coding
- Use production mode only for deployment/testing release builds
- Any dependency changes require rebuilding the Docker image

# ❓ Do I need to run npm install?
No.
When using Docker:
- npm install is handled automatically inside the container
- npm run dev is handled by the development container
- npm run build is handled during the production build process

👉 You do not need to install Node.js locally.

# 🧠 Summary
| Environment | Command | Purpose |
|-------------|---------|---------|
| Development | `docker compose -f docker-compose.dev.yml up --build` | Local development with hot reload |
| Production | `docker compose -f docker-compose.prod.yml up --build -d` | Optimized production deployment |

# 👥 Team Workflow
When a new developer joins the project:
## 1. Clone the repository
git clone <repository-url>
cd project
## 2. Start development environment
docker compose -f docker-compose.dev.yml up --build
## 3. Start developing
Open:
http://localhost:3000
No additional setup is required.