# TrueKeeps - Photo Book Creation Platform

Transform your digital memories into beautiful physical keepsakes with TrueKeeps. Create custom photo books, canvas prints, framed prints, and photo albums with our intuitive design platform.

## Features

- **Theme Selection**: Choose from pre-built themes for weddings, babies, travel, and more
- **Dual Editing Modes**: Quick Start mode for guided assistance or Advanced mode for full creative control
- **Drag-and-Drop Photo Upload**: Easy photo management with instant preview
- **Canvas Editing**: Drag photos onto pages with snap-to-grid precision
- **3D Preview**: See realistic visualizations of your final product
- **Auto-Layout**: AI-powered photo arrangement for effortless design
- **Full Persistence**: Projects, photos, and themes persist across sessions

## Tech Stack

### Frontend
- React + TypeScript
- Vite for fast development
- TailwindCSS for styling
- ShadCN/UI components
- TanStack Query for data fetching
- Wouter for routing

### Backend
- Express.js
- TypeScript
- Drizzle ORM
- PostgreSQL (Neon)
- RESTful API design

## Getting Started

### Option 1: Run on Replit

This project is designed to run on Replit. Simply:

1. Fork this Replit App
2. Click "Run" - all dependencies will be installed automatically
3. The application will start on port 5000

### Option 2: Local Development via SSH

Connect your local IDE to Replit using SSH:

1. **Generate SSH Keypair** (if you don't have one):
   ```bash
   # Mac/Linux
   ssh-keygen -t ed25519 -f ~/.ssh/replit -q -N ""
   
   # Windows
   ssh-keygen -t ed25519 -f %HOMEPATH%\.ssh\replit -q -N ""
   ```

2. **Get your public key**:
   ```bash
   # Mac/Linux
   cat ~/.ssh/replit.pub
   
   # Windows
   notepad %HOMEPATH%\.ssh\replit.pub
   ```

3. **Add SSH key to Replit**:
   - In your Replit App, search for "SSH" in the "+" menu
   - Navigate to "Keys" tab and click "New SSH key"
   - Paste your public key and save

4. **Configure SSH** (add to `~/.ssh/config`):
   ```
   Host *.replit.dev
       Port 22
       IdentityFile ~/.ssh/replit
       StrictHostKeyChecking accept-new
   ```

5. **Connect from VS Code**:
   - Go to SSH pane in Replit
   - Click "Launch VS Code" or use the provided SSH command

### Option 3: Clone and Run Locally

1. **Clone the repository**:
   ```bash
   git clone <your-replit-git-url>
   cd truekeeps
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables** (create `.env` file):
   ```
   NODE_ENV=development
   DATABASE_URL=your_postgres_connection_string
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   ```
   http://localhost:5001
   ```

## Project Structure

```
.
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components (Home, Templates, Create)
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # Utilities and query client
│   │   └── App.tsx        # Main app with routing
│   └── index.html
├── server/                # Backend Express application
│   ├── routes.ts          # API route handlers
│   ├── storage.ts         # Data storage interface
│   ├── index.ts           # Server entry point
│   └── vite.ts            # Vite integration
├── shared/                # Shared code between frontend and backend
│   └── schema.ts          # Database schema and types
├── attached_assets/       # Static assets (images, logos)
├── design_guidelines.md   # UI/UX design system
└── replit.md             # Project documentation
```

## API Routes

### Photobook Management
- `POST /api/projects` - Create a new photobook project
- `GET /api/projects/:id` - Fetch project metadata
- `GET /api/projects` - List all projects

### Photo Management
- `POST /api/uploads` - Upload photos (base64)
- `GET /api/projects/:projectId/uploads` - Fetch project photos
- `DELETE /api/uploads/:id` - Delete a photo

### Themes & Products
- `GET /api/themes` - List all themes
- `GET /api/themes/:id` - Fetch theme details
- `GET /api/products` - List all products

## User Flow

1. **Browse** - Explore product categories and promotional content
2. **Select Theme** - Choose a pre-built theme or blank canvas
3. **Create Project** - Name your photobook project
4. **Upload Photos** - Drag-and-drop or select photos
5. **Edit & Arrange** - Place photos on pages with canvas editor
6. **Preview** - View 3D visualization of final product
7. **Order** - Complete your purchase (coming soon)

## Development

### Adding New Pages

1. Create page component in `client/src/pages/`
2. Register route in `client/src/App.tsx`
3. Update navigation if needed

### Modifying Database Schema

1. Update schema in `shared/schema.ts`
2. Update storage interface in `server/storage.ts`
3. Create corresponding API routes in `server/routes.ts`

### Styling Guidelines

- Follow TrueKeeps brand colors: `#06097e` (blue), `#d04c8a` (pink), `#5ac7e6` (light blue), `#3a3a3a` (dark gray)
- Use Outfit font family for all typography
- Reference `design_guidelines.md` for detailed design system

## Storage

Currently using in-memory storage (MemStorage) for development. For production:

1. Set up PostgreSQL database (Neon recommended)
2. Configure `DATABASE_URL` environment variable
3. Run database migrations with Drizzle Kit
4. Switch storage implementation from MemStorage to database

## Testing

Run end-to-end tests with the integrated testing tools:

```bash
# Tests are automated via Replit's testing interface
# Access via the testing panel in your Replit workspace
```

## Contributing

1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Support

For issues or questions:
- Check the documentation in `replit.md`
- Review design guidelines in `design_guidelines.md`
- Open an issue in the repository

---

Built with ❤️ using Replit
