# Deployment Guide for TrueKeeps Canvas

This guide covers multiple free hosting options for your full-stack application.

## 🚀 Quick Start Options

### 1. Vercel (Recommended for React + Node.js)
**Best for**: React frontend with serverless backend functions

#### Setup:
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel` in project root
3. Follow the prompts
4. Your app will be deployed automatically

#### Features:
- ✅ Automatic deployments from Git
- ✅ Serverless functions
- ✅ Edge functions
- ✅ Custom domains
- ✅ Analytics

#### Database:
- Use Neon (free PostgreSQL) or PlanetScale (free MySQL)
- Add connection string to environment variables

---

### 2. Railway (Best Overall)
**Best for**: Full-stack apps with database needs

#### Setup:
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway will auto-detect your Node.js app
4. Add PostgreSQL database if needed

#### Features:
- ✅ Full-stack deployment
- ✅ Built-in PostgreSQL database
- ✅ Persistent storage
- ✅ Custom domains
- ✅ $5/month credit (usually enough for small apps)

#### Database:
- Built-in PostgreSQL included
- Connection string auto-provided

---

### 3. Render
**Best for**: Traditional web applications

#### Setup:
1. Go to [render.com](https://render.com)
2. Connect your GitHub repository
3. Select "Web Service"
4. Use the provided `render.yaml` configuration

#### Features:
- ✅ Web services
- ✅ Built-in PostgreSQL
- ✅ Background workers
- ✅ Custom domains
- ✅ Free tier available

#### Database:
- Built-in PostgreSQL included
- Connection string in environment variables

---

## 🔧 Environment Variables

Set these in your hosting platform:

```bash
NODE_ENV=production
PORT=5000  # or platform-specific port
DATABASE_URL=your_database_connection_string
SESSION_SECRET=your_session_secret
```

## 📊 Comparison Table

| Platform | Free Tier | Database | Ease of Use | Best For |
|----------|-----------|----------|-------------|----------|
| **Vercel** | ✅ Generous | External | ⭐⭐⭐⭐⭐ | React + Serverless |
| **Railway** | ✅ $5 credit | Built-in | ⭐⭐⭐⭐ | Full-stack apps |
| **Render** | ✅ Limited | Built-in | ⭐⭐⭐ | Traditional apps |
| **Netlify** | ✅ Good | External | ⭐⭐⭐⭐ | JAMstack apps |

## 🎯 Recommendation

**For your TrueKeeps Canvas project, I recommend Railway** because:
- Full-stack support with built-in database
- Generous free tier
- Easy setup
- Great for e-commerce applications
- Handles both frontend and backend seamlessly

## 🚀 Next Steps

1. Choose your preferred platform
2. Push your code to GitHub
3. Connect the platform to your repository
4. Set up environment variables
5. Deploy!

Your app will be live at a URL like:
- Vercel: `https://your-app.vercel.app`
- Railway: `https://your-app.railway.app`
- Render: `https://your-app.onrender.com`
