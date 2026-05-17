# Update Notification E2E Testing

## Title
Implement modal-card update notification UI with comprehensive e2e tests

## Description

### What Changed

Refactored the update notification system to display as an elegant bottom-right modal card with comprehensive e2e testing support.

#### Frontend Changes
- **`components/update-banner.tsx`**: Redesigned update notification as fixed bottom-right modal card
  - Added release notes toggle with markdown rendering (react-markdown)
  - Implemented 24-hour "Remind Me Later" dismissal via localStorage
  - Displays version number, download icon, changelog, and three action buttons
  - Improved UX with better visual hierarchy and persistence
  
- **`components/settings/general-settings.tsx`**: Added "Check for Updates" section
  - Manual trigger button for update checks
  - Toast notifications for user feedback
  - Only shown for non-enterprise builds

#### Backend Changes
- **`src-tauri/src/commands.rs`**: New `check_for_updates()` command
  - Allows manual update checks from the settings UI
  
- **`lib/utils/tauri.ts`**: Added TypeScript binding for `checkForUpdates()`

#### E2E Testing
- **`e2e/specs/update-notification.spec.ts`**: Complete test coverage
  - Tests modal card appearance and content
  - Tests release notes toggle and markdown rendering
  - Tests "Remind Me Later" dismissal and localStorage
  - Tests settings "Check for Updates" button
  - Tests state persistence across sessions
  
- **`e2e/mock-updates/server.js`**: Mock HTTP server
  - Serves update manifest on port 8765
  - Used for offline e2e testing
  
- **`e2e/mock-updates/manifest.json`**: Sample update manifest
  - Version 2.4.229 with markdown release notes
  - Platform-specific download URLs

### How to Test

```powershell
# 1. Build with e2e updater config (uses src-tauri/tauri.e2e.json)
cd apps/screenpipe-app-tauri
bun tauri build --config src-tauri/tauri.e2e.json --no-sign --debug --no-bundle -- --features e2e

# 2. Terminal 1: Start mock server
cd e2e/mock-updates
node server.js

# 3. Terminal 2: Run test
cd apps/screenpipe-app-tauri
bun run wdio run e2e/wdio.conf.ts --spec e2e/specs/update-notification.spec.ts
```

**Note:** The `--config src-tauri/tauri.e2e.json` flag merges the e2e updater config with the main tauri.conf.json. No manual config editing needed!

### What's Tested
✅ Update notification displays as bottom-right modal card (not top banner)
✅ Shows "New Version X.X.X" with download icon and "Update Available" subtitle
✅ "Show Release Notes" button toggles detailed changelog display
✅ Release notes render correctly with markdown formatting (links, headings, lists)
✅ "Remind Me Later" dismisses notification and persists for 24 hours via localStorage
✅ "Update Now" button present and functional
✅ Settings "Check for Updates" button manually triggers update checks
✅ Notification respects 24-hour dismiss state and shows again after expiry
✅ No UI crashes or regressions during any user interaction  

### User Experience
1. **Update Available**: Elegant modal card appears at bottom-right corner showing new version number, "Update Available" subtitle, and action buttons (Show Release Notes, Remind Me Later, Update Now)
2. **Detailed Release Notes**: Users can expand release notes to see full changelog with markdown formatting (bullet points, links, formatting)
3. **Smart Dismissal**: "Remind Me Later" closes the notification and won't show again for 24 hours
4. **Manual Checks**: Settings > General section provides "Check for Updates" button for on-demand checks

### Files Modified
- `apps/screenpipe-app-tauri/components/update-banner.tsx`
- `apps/screenpipe-app-tauri/components/settings/general-settings.tsx`
- `apps/screenpipe-app-tauri/src-tauri/src/commands.rs`
- `apps/screenpipe-app-tauri/lib/utils/tauri.ts`

### Files Added
- `apps/screenpipe-app-tauri/e2e/specs/update-notification.spec.ts` - E2E test spec
- `apps/screenpipe-app-tauri/e2e/mock-updates/server.js` - Mock update server
- `apps/screenpipe-app-tauri/e2e/mock-updates/manifest.json` - Sample update manifest
- `apps/screenpipe-app-tauri/src-tauri/tauri.e2e.json` - E2E updater config override

### Notes
- Update check still happens automatically on app startup via existing UpdatesManager
- Settings button allows manual checks and resets 24-hour reminder
- localStorage key: `screenpipe-remind-me-later` (timestamp-based)
- Modal is fixed bottom-right, doesn't interfere with app UI
- All existing update flow (download, install, restart) remains unchanged
