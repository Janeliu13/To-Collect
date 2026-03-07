# Collect

A social platform for collecting and sharing objects with friends.

## Features

- 📸 **Object Collection**: Capture and upload objects with automatic background removal
- 👥 **User Profiles**: Personal collections with customizable "feeling" slots
- 💬 **Real-time Chat**: Message other users and share objects
- 🔄 **Repost System**: Share objects you like to your profile
- 🏷️ **Categories**: Organize objects by categories
- 🎨 **Beautiful UI**: Modern, colorful interface with smooth animations

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Styling**: Custom CSS
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account

### Installation

1. Clone the repository
```bash
git clone <your-repo-url>
cd Collect
```

2. Install dependencies
```bash
cd app
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

4. Run the development server
```bash
npm run dev
```

## Deployment

This project is configured for easy deployment on Vercel:

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## Database Setup

Run the migrations in `supabase/migrations/` in order to set up your database schema.

## License

Private project
