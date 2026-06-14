/* ============================================================
   Razorpay backend for "Unique & Stylish"
   Add these two routes to your existing Express server (server.js).
   They are what make the money actually reach your account safely.

   SETUP
   -----
   1) Install the SDK in your server folder:
        npm install razorpay

   2) Keep your keys in environment variables (NEVER in index.html / git):
        RAZORPAY_KEY_ID      = rzp_test_xxxxxxxx   (or rzp_live_xxxxxxxx)
        RAZORPAY_KEY_SECRET  = your_secret_here
      Get both from Razorpay Dashboard → Settings → API Keys.

   3) In index.html, set RAZORPAY_KEY_ID to the SAME Key ID (public).
      The SECRET stays here on the server only.

   4) Settlements: in the Razorpay Dashboard, add your bank account under
      Settings → Bank Accounts. Razorpay auto-settles captured payments to
      that bank account (T+2 working days by default).
   ============================================================ */

const Razorpay = require('razorpay');
const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

/**
 * Call this from server.js, passing in your Express `app`:
 *   const attachRazorpay = require('./razorpay-backend');
 *   attachRazorpay(app);
 */
module.exports = function attachRazorpay(app) {

  // 1) Frontend asks us to create an order. We sign it with the SECRET.
  app.post('/api/razorpay/order', async (req, res) => {
    try {
      const rupees = Number(req.body.amount);
      if (!rupees || rupees < 1) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      const order = await razorpay.orders.create({
        amount: Math.round(rupees * 100),       // Razorpay works in paise
        currency: 'INR',
        receipt: String(req.body.receipt || 'rcpt_' + Date.now()),
        payment_capture: 1                       // auto-capture on success
      });
      // Send only what the browser needs (NOT the secret).
      res.json({ id: order.id, amount: order.amount, currency: order.currency });
    } catch (err) {
      console.error('razorpay/order error:', err);
      res.status(500).json({ error: 'Could not create order' });
    }
  });

  // 2) After payment, frontend sends back the 3 fields. We verify the
  //    signature with the SECRET. Only a valid signature means real payment.
  app.post('/api/razorpay/verify', (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ verified: false, error: 'Missing fields' });
      }

      const expected = crypto
        .createHmac('sha256', KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      // timingSafeEqual avoids leaking info via comparison timing
      const ok =
        expected.length === razorpay_signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));

      if (!ok) return res.status(400).json({ verified: false });

      // TODO (recommended): mark the matching order as PAID in MongoDB here,
      //   storing razorpay_payment_id against the orderId.
      res.json({ verified: true, paymentId: razorpay_payment_id });
    } catch (err) {
      console.error('razorpay/verify error:', err);
      res.status(500).json({ verified: false });
    }
  });
};
