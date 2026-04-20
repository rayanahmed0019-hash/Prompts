export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // ✅ Only process Gumroad sale events
    if (data.resource_name !== 'sale') {
      return res.status(200).json({ message: 'Ignored (not sale)' });
    }

    const buyerEmail = data.email;
    const sellerId = data.seller_id;
    const saleId = data.sale_id;

    // ✅ Basic security check
    if (sellerId !== process.env.GUMROAD_SELLER_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!buyerEmail) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // ✅ Prevent duplicate processing (VERY IMPORTANT)
    // (simple memory protection - better than nothing)
    if (!global.processedSales) global.processedSales = new Set();

    if (global.processedSales.has(saleId)) {
      console.log('Duplicate webhook ignored:', saleId);
      return res.status(200).json({ message: 'Duplicate ignored' });
    }

    global.processedSales.add(saleId);

    const supabaseAdminUrl = `${process.env.SUPABASE_URL}/auth/v1/admin/users`;

    // temp password (user will reset anyway)
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

    // ✅ Create user
    const createUserResponse = await fetch(supabaseAdminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email: buyerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          source: 'gumroad',
          sale_id: saleId,
          purchased_at: new Date().toISOString(),
        }
      })
    });

    const userData = await createUserResponse.json();

    // ✅ Handle "user already exists"
    if (!createUserResponse.ok) {
      if (createUserResponse.status === 422) {
        console.log('User already exists:', buyerEmail);
      } else {
        throw new Error(JSON.stringify(userData));
      }
    }

    // ✅ Send password reset email (important for login to work)
    const resetUrl = `${process.env.SUPABASE_URL}/auth/v1/recover`;

    await fetch(resetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ email: buyerEmail })
    });

    console.log('✅ User ready:', buyerEmail);

    return res.status(200).json({
      success: true,
      email: buyerEmail
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
