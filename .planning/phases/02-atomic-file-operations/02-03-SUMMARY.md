# Plan 02-03 Summary: Human Verification

**Status:** Complete
**Duration:** Manual testing session

## Verification Results

### Test 1: Upload Validation (FILE-01) ✓
- [x] PDF files upload successfully via drag-drop
- [x] TXT files upload successfully (after MIME type fix in storage bucket)
- [x] ZIP files correctly rejected with ERR_INVALID_TYPE
- [x] Duplicate filenames now work (after adding storage UPDATE policy)

### Test 2: Batch Upload with Progress ✓
- [x] Multiple files can be selected
- [x] Progress indicator shows during batch upload

### Test 3: Rollback Visibility (ERR-02) ✓
- [x] Error toasts show error code and message
- [x] Retry button appears in error toast

### Test 4: Download and View (FILE-03) ✓
- [x] Click document name → PDF opens in new tab
- [x] Click download icon → File downloads with correct filename (after blob fetch fix)

### Test 5: Atomic Delete (FILE-02, ERR-03) ✓
- [x] Delete modal shows document name and mentions embeddings
- [x] Delete removes document from list
- [x] Cascades properly (DB-first pattern)

### Test 6: Consistency Check ✓
- [x] System handles edge cases gracefully

## Issues Found and Fixed During Verification

| Issue | Root Cause | Fix |
|-------|------------|-----|
| TXT upload failed with "mime type not supported" | Supabase storage bucket only allowed `application/pdf` | Updated `allowed_mime_types` array in `storage.buckets` to include all supported types |
| Duplicate filename caused RLS error | Missing UPDATE policy on `storage.objects` | Added "Update files" policy matching INSERT policy pattern |
| Download opened in new tab instead of downloading | `download` attribute doesn't work for cross-origin URLs | Changed to fetch blob → createObjectURL approach |

## Commits

- `47d4821`: fix(02-02): use blob fetch for cross-origin download

## Database Changes (via Supabase MCP)

1. Updated `storage.buckets.allowed_mime_types` for `project-files`:
   - `application/pdf`
   - `text/plain`
   - `text/csv`
   - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - `application/vnd.ms-excel`

2. Added storage policy "Update files" on `storage.objects` for UPDATE operations

## Requirements Verified

| Requirement | Status |
|-------------|--------|
| FILE-01: Upload validation | ✓ Verified |
| FILE-02: Atomic delete | ✓ Verified |
| FILE-03: Download with signed URLs | ✓ Verified |
| ERR-02: Rollback visibility | ✓ Verified |
| ERR-03: Delete atomicity | ✓ Verified |

## Post-Verification Enhancement

**Direct browser upload for large files** (commit `c5ed409`):
- Files >1MB now upload directly to Supabase Storage using browser client
- DB record created via server action after storage upload
- Server action handles rollback if DB insert fails
- Resolves Next.js server action ~1MB body size limit
