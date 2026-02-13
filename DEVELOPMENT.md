# 🛠️ Development Guide

## Current Setup Status ✅

Your server is running at: **http://172.16.0.2:8000**

## Quick Commands

### Start Server
```bash
# Using npm script (recommended)
npm start

# Or using batch file (Windows)
start.bat

# Or using shell script (Linux/Mac)
./start.sh

# Or manually
http-server -p 8000 -c-1 --cors
```

### Access Points

| Page | URL |
|------|-----|
| **Home (Root)** | http://localhost:8000 |
| **Main App** | http://localhost:8000/HTML/index.html |
| **Bus List** | http://localhost:8000/HTML/buslist.html |
| **Live Tracking** | http://localhost:8000/HTML/track.html |

## Testing Workflow

### 1. Test Homepage
- Open http://localhost:8000
- Should auto-redirect to HTML/index.html
- Enter "From" and "To" locations
- Validate form inputs work

### 2. Test Bus Search
- Click "Find Bus"
- Should navigate to buslist.html with query params
- Check browser console for Firebase connection

### 3. Test Live Tracking
- Click "Track" on any bus
- Open track.html with bus ID parameter
- Map should load with Leaflet
- Test "Inside This Bus" button (requires GPS permission)

### 4. Test GPS Sharing
- Click "Inside This Bus"
- Browser will request location permission
- Allow location access
- Check Firebase Console for data updates
- Verify location appears on map

## Debugging

### Open Browser Console
- **Chrome/Edge**: F12 or Ctrl+Shift+I
- **Firefox**: F12 or Ctrl+Shift+K

### Check for Errors
```javascript
// Should see in console:
// ✅ "🔥 Firebase Connected: [object]"
// ✅ "Offline persistence enabled"
```

### Common Issues

**1. Firebase Not Connecting**
- Check internet connection
- Verify `FIREBASE/firebase.js` config
- Check Firebase Console quotas

**2. GPS Not Working**
- Must allow browser location permission
- HTTPS required in production (localhost OK)
- Check device location services enabled

**3. Map Not Loading**
- Check Leaflet CDN connection
- Verify map container has height in CSS
- Open console for JavaScript errors

**4. No Buses Showing**
- Add sample data to Firebase:
```json
{
  "buses": {
    "bus1": {
      "id": "Bus 101",
      "route": ["Delhi", "Noida", "Gurgaon"],
      "schedule": ["08:00", "09:00", "10:00"],
      "active": true
    }
  }
}
```

## File Structure

```
where-is-my-bus/
├── HTML/
│   ├── index.html      # Home page
│   ├── buslist.html    # Search results
│   └── track.html      # Live tracking
├── CSS/
│   ├── style.css       # Home styles
│   ├── buslist.css     # List styles
│   └── track.css       # Tracking styles
├── JS/
│   ├── script.js       # Home logic
│   ├── buslist.js      # Search logic
│   └── track.js        # Tracking logic
├── FIREBASE/
│   └── firebase.js     # Firebase config
├── index.html          # Root redirect
├── package.json        # npm config
└── start.bat/sh        # Launcher scripts
```

## Next Steps

1. ✅ Server running
2. ⏳ Test all pages
3. ⏳ Add sample bus data to Firebase
4. ⏳ Test GPS location sharing
5. ⏳ Deploy to production (optional)

## Production Deployment

When ready to deploy:
1. Get HTTPS certificate
2. Update Firebase rules for security
3. Set up Firebase hosting or use Netlify/Vercel
4. Configure environment variables
5. Enable Firebase Analytics (optional)

---

**Current Status**: Development server active on port 8000 ✅
