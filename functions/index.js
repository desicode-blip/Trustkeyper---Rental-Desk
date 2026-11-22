// Rental Desk server side: reads Google Drive files for signed-in team members
// (the golden-leads Google Sheet and Drive photo links). Runs as the project's
// service account, so files must be shared with it (or shared "anyone with the link").
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {google} = require('googleapis');
admin.initializeApp();

const ADMINS = ['info@trustkeyper.com', 'amanmaheshwari900@gmail.com'];
async function isMember(auth) {
  if (!auth || !auth.token || !auth.token.email || auth.token.email_verified !== true) return false;
  const email = auth.token.email.toLowerCase();
  if (ADMINS.includes(email)) return true;
  return (await admin.firestore().doc('access/' + email).get()).exists;
}

exports.drive = onCall({region: 'asia-south1', memory: '1GiB', timeoutSeconds: 120}, async (req) => {
  if (!(await isMember(req.auth))) throw new HttpsError('permission-denied', 'Not invited to the desk.');
  const {tool, args = {}} = req.data || {};
  const auth = new google.auth.GoogleAuth({scopes: ['https://www.googleapis.com/auth/drive.readonly']});
  const drive = google.drive({version: 'v3', auth});
  try {
    if (tool === 'download_file_content') {
      const meta = (await drive.files.get({fileId: args.fileId, fields: 'id,name,mimeType,size', supportsAllDrives: true})).data;
      const native = meta.mimeType.startsWith('application/vnd.google-apps');
      if (!native && Number(meta.size || 0) > 12 * 1024 * 1024) throw new HttpsError('out-of-range', 'File is over 12 MB.');
      const res = native
        ? await drive.files.export({fileId: args.fileId, mimeType: args.exportMimeType || 'text/plain'}, {responseType: 'arraybuffer'})
        : await drive.files.get({fileId: args.fileId, alt: 'media', supportsAllDrives: true}, {responseType: 'arraybuffer'});
      return {id: meta.id, title: meta.name, mimeType: native ? (args.exportMimeType || 'text/plain') : meta.mimeType, content: Buffer.from(res.data).toString('base64')};
    }
    if (tool === 'search_files') {
      const m = String(args.query || '').match(/parentId = '([\w-]+)'/);
      if (!m) throw new HttpsError('invalid-argument', 'Only folder listing is supported.');
      const r = await drive.files.list({q: `'${m[1]}' in parents and trashed = false and mimeType contains 'image/'`, fields: 'files(id,name,mimeType,size)', pageSize: Math.min(Number(args.pageSize) || 20, 50), supportsAllDrives: true, includeItemsFromAllDrives: true});
      return {files: r.data.files || []};
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const code = e && e.code;
    throw new HttpsError(code === 404 || code === 403 ? 'not-found' : 'internal', 'Drive could not open that file. Share it with the desk or make the link viewable.');
  }
  throw new HttpsError('invalid-argument', 'Unknown tool.');
});
