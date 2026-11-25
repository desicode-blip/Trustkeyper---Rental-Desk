/* Rental Desk ⇄ TK2 tenant web app bridge.
   The tenant page at /t/ is TrustKeeper 2's own tenant web app, built unchanged
   from the TK2 repo (demo mode: everything lives in the tenant's browser).
   This file is desk-owned. It watches what the TK2 app saves in the browser and
   copies the tenant's visit and journey progress back to the desk, so the
   Matches page sees bookings, cancellations, "liked it", token and details.
   It never changes what the TK2 app shows. */
(function () {
  var sid = new URLSearchParams(location.search).get('s') || '';
  if (!/^[a-z2-9]{12}$/.test(sid)) return;
  var STORE = 'flutter.tk2_store_v1', SESSION = 'flutter.tkweb_session_v1';
  var share = null, last = '', db = null;

  function read(k) { try { var v = localStorage.getItem(k); if (!v) return null; var j = JSON.parse(v); return typeof j === 'string' ? JSON.parse(j) : j; } catch (e) { return null; } }
  function statusOf(s) {
    s = String(s || '').replace(/^VisitStatus\./, '');
    if (/cancel/i.test(s)) return 'cancelled';
    if (s === 'done' || s === 'noShow') return 'visited';
    return 'booked';
  }
  function code4(c) { c = String(c || '').replace(/\D/g, ''); return c.length >= 4 ? c.slice(-4) : ('0000' + c).slice(-4); }

  async function sync() {
    if (!db || !share) return;
    var st = read(STORE) || {}, se = read(SESSION) || {};
    var visits = (st.visits || []);
    var trips = se.trips || {};
    var snap = JSON.stringify([visits, trips]);
    if (snap === last) return;
    last = snap;
    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];
      var trip = trips[v.listingId] || {};
      var id = 'tk-' + sid + '-' + String(v.id || i).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      var ref = db.collection('visits').doc(id);
      var status = statusOf(v.status);
      try {
        var cur = await ref.get();
        if (!cur.exists) {
          await ref.set({ sid: sid, tid: share.tid, pid: share.pid, at: new Date(v.at || Date.now()).toISOString(),
            name: String(v.customerName || se.name || '').slice(0, 80) || 'Tenant', phone: String(v.customerPhone || se.contact || '').slice(0, 20),
            code: code4(v.code), status: 'booked', createdAt: new Date().toISOString(), src: 'tk2' });
          cur = await ref.get();
        }
        var d = cur.data() || {}, patch = {};
        if (status !== d.status && !(d.status === 'cancelled')) patch.status = status;
        if (trip.liked === true && d.liked !== 'yes') patch.liked = 'yes';
        if (trip.liked === false && d.liked !== 'no') patch.liked = 'no';
        var step = Number(trip.step || 0);
        if (step !== (d.step || 0)) patch.step = step;
        if (step >= 2 && !d.tokenPaid) patch.tokenPaid = true;
        if (trip.docs && !d.docsSent) patch.docsSent = true;
        if (step >= 4 && !d.detailsSent) patch.detailsSent = true;
        if (Object.keys(patch).length) { patch.updatedAt = new Date().toISOString(); await ref.update(patch); }
      } catch (e) { last = ''; }
    }
  }

  function start() {
    if (!window.firebase || !firebase.firestore) return setTimeout(start, 500);
    db = firebase.firestore();
    db.doc('shares/' + sid).get().then(function (d) { if (d.exists) { share = d.data(); sync(); } }).catch(function () {});
    setInterval(sync, 2500);
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', sync);
  }
  start();
})();
