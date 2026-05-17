# Update Notification Feature - Technical Guide

## Overview

Screenpipe's update notification system displays available app updates in an elegant modal card at the bottom-right of the screen. Users can view release notes, dismiss for 24 hours, or update immediately. Manual update checks are available in Settings.

## Architecture

### Update Check Triggers

1. **Automatic (On Startup)** - UpdatesManager calls check_for_updates(false)
2. **Automatic (Periodic)** - UpdatesManager polls every N minutes (check_for_updates(false))
3. **Manual (Settings)** - User clicks "Check for Updates" button (check_for_updates(true))

## E2E Testing

### Test File
**Location:** `apps/screenpipe-app-tauri/e2e/specs/update-notification.spec.ts`

**Test Suites:**
1. Update banner modal card - Appearance and content
2. Release notes toggle - Show/hide and markdown rendering
3. Remind Me Later - Dismissal and localStorage persistence
4. Update Now button - Presence and styling
5. Check for Updates in Settings - Navigation and functionality
6. State persistence - 24-hour expiry logic



### Mock Server
**File:** `apps/screenpipe-app-tauri/e2e/mock-updates/server.js`

**Features:**
- Node.js HTTP server on port 8765
- Serves manifest.json at `/` and `/manifest.json`
- Returns placeholder binary for download requests
- CORS enabled for cross-origin requests
- Error handling for port conflicts

**Usage:**
```powershell
cd apps/screenpipe-app-tauri/e2e/mock-updates
node server.js
```

### Test Manifest
**File:** `apps/screenpipe-app-tauri/e2e/mock-updates/manifest.json`

```json
{
  "version": "2.4.229",
  "notes": "## Changelog...",
  "pub_date": "2026-05-17T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "http://127.0.0.1:8765/screenpipe-update.exe"
    }
    // ... other platforms
  }
}
```

**Edit manifest to test:**
- Change `version` for version detection
- Update `notes` for markdown rendering
- Modify `pub_date` for release date display

## Building for E2E Testing

### Standard Build (Production Endpoints)
```powershell
bun tauri build --no-sign --debug --no-bundle -- --features e2e
```

### E2E Build (Local Localhost Endpoint)
```powershell
bun tauri build --config src-tauri/tauri.e2e.json --no-sign --debug --no-bundle -- --features e2e
```

**The `--config src-tauri/tauri.e2e.json` flag:**
- Merges e2e config with main tauri.conf.json
- Overrides updater endpoint to http://127.0.0.1:8765/
- No manual config editing needed

## Running E2E Tests

### Quick Start
```powershell
# Terminal 1: Start mock server
cd apps/screenpipe-app-tauri/e2e/mock-updates
node server.js

# Terminal 2: Run test
cd apps/screenpipe-app-tauri
bun run wdio run e2e/wdio.conf.ts --spec e2e/specs/update-notification.spec.ts
```

### Run All E2E Tests
```powershell
bun run test:e2e
```

### Record Video
```powershell
$env:RECORD_VIDEO="1"
bun run wdio run e2e/wdio.conf.ts --spec e2e/specs/update-notification.spec.ts
```

**Results:**
- Screenshots: `e2e/screenshots/`
- Videos: `e2e/videos/` (with RECORD_VIDEO=1)
- Logs: `.e2e/logs/`

## Events and Messaging

### Tauri Events (Rust → Frontend)

**update-available**
```json
{
  "version": "2.4.229",
  "body": "## Release notes..."
}
```

**update-downloading**
```json
{
  "version": "2.4.229",
  "body": "..."
}
```

**update-download-progress**
```json
{
  "version": "2.4.229",
  "downloaded": 1024000,
  "total": 10240000,
  "percent": 10
}
```

**update-auth-required**
```json
{
  "version": "2.4.229",
  "message": "Sign in to download"
}
```

**update-restarting**
```json
{
  "version": "2.4.229",
  "delay_secs": 30
}
```

## Platform-Specific Behavior

### Windows
- Update binary downloaded on-demand when user clicks "Update Now"
- screenpipe stops before update installation
- Binary replaced, app relaunches automatically

### macOS / Linux
- Update binary pre-downloaded by backend
- Direct installation after "Update Now" click
- App restarts automatically after installation

## Troubleshooting

### Update notification not appearing
1. Check UpdatesManager logs in `.e2e/logs/`
2. Verify endpoint in tauri.conf.json or tauri.e2e.json
3. Test mock server: `curl http://127.0.0.1:8765/manifest.json`
4. Ensure manifest version > running app version
5. Check if running in dev/source build (updates disabled)

### Port 8765 already in use
```powershell
netstat -ano | findstr :8765
taskkill /PID <PID> /F
```

### WebDriver timeout (e2e test)
- Build didn't include `--features e2e`
- App crashed at startup
- Check `.e2e/logs/` for errors
- Try: `Remove-Item -Recurse -Force .e2e/`

### Release notes not rendering
- Check manifest JSON is valid
- Verify `notes` field contains markdown
- Check browser console for errors
- Ensure react-markdown is imported


## Development Workflow

### Local Testing
1. Build with e2e config: `bun tauri build --config src-tauri/tauri.e2e.json --features e2e`
2. Start mock server: `cd e2e/mock-updates && node server.js`
3. Run test: `bun run wdio run e2e/wdio.conf.ts --spec e2e/specs/update-notification.spec.ts`
4. Check screenshots: `e2e/screenshots/`



## Performance Considerations

- Update check runs asynchronously, doesn't block UI
- Download progress shown to user with percentage
- 24-hour reminder prevents notification spam
- Release notes loaded on-demand (toggle)
- Modal positioned fixed, minimal performance impact
- localStorage check is instant (< 1ms)



## Future Enhancements

Potential improvements:
- Settings for auto-update behavior
- Update scheduler (time-based checks)
- Rollback to previous version
- Detailed update history
- Bandwidth limit for downloads
- Custom update channels (beta, nightly)
