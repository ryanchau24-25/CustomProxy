# CustomProxy

CustomProxy is a polished search engine website inspired by Google. It includes a clean homepage, search results view, autocomplete suggestions, account authentication, recent searches, and an admin dashboard.

## Features

- Modern home page with search bar, dark/light mode toggle, and voice search UI
- Backend search API with mock results and ranking logic
- User signup, login, logout, and recent search history
- Admin dashboard for managing users and search activity
- Mobile responsive design and SEO-friendly pages
- Secure Express server with Helmet and session handling

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables from `.env.example`:

```bash
cp .env.example .env
```

3. Start the application:

```bash
npm run dev
```

4. Open the site:

```text
http://localhost:4000
```

## Admin Access

The first admin user is created automatically when the app starts.

- Email: `admin@customproxy.local`
- Password: `admin123`

## Deploying

For production, set `NODE_ENV=production` and configure a secure `SESSION_SECRET` in `.env`.

Recommended deployment flow:

1. Install dependencies: `npm install`
2. Set environment variables: `PORT`, `SESSION_SECRET`
3. Start the server: `npm start`

### Deploying to Railway

Railway supports Node.js apps directly and can deploy this project from GitHub.

1. Commit and push all files, including `package.json`, `Procfile`, and `start.sh`, to GitHub.
2. Create a Railway project and connect the repository.
3. Add environment variables in Railway:
   - `PORT` (Railway will provide one automatically)
   - `SESSION_SECRET`
4. Use the included `Procfile`:
   - `web: npm start`

If Railway still fails to detect the app, it may be using a cached or incomplete repository snapshot. Reconnect the repo or redeploy after pushing all files.

> Note: This project uses SQLite for local persistence. Railway containers are ephemeral, so stored data may reset on redeploy or restart. For production use, switch to a hosted database plugin such as PostgreSQL or another external datastore.

---

### Notes

- The search engine uses a mock dataset for results, making it fast and self-contained.
- If you want to extend it, connect a real search API or add a richer database.
