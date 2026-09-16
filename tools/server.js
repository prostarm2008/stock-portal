const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Proxy endpoints for Power Automate flows to bypass CORS
const flows = {
  login: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/31/workflows/0160b3e1366546e9a69b79e46f4cf8aa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lWUdyXqHv1H8NfMPGJguB--GTqc8DBzBtN9-3812cCc",
  listUsers: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/75f7ef6d7396417593d2008d33655fee/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=O9eYsj4nJv9mMfpiwcl_K_1nB3fK-tFSRQtqAWRFabI",
  saveUser: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/3aab831bc2c14b4b87f97581ce018449/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=mK86MKdmBzcmYvezFrRo9kYlJkIt0kUrOjYGDsMNxgk",
  listProducts: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/02/workflows/6516548238294d4a8564db3009fa21d7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=r0d5JXEfATi9nsl4Kosrtx_BSXmS13TzYm30KKBKsqM",
  saveProduct: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/7c0dd9cb57ee46b69cc93d99b7f171b0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=NlJcfJgD3tvGZtcT6oznEAXPn7798ZI2hb6n1R9_zpU",
  listStock: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/01/workflows/0f0efb050e044628859dccc6dd753361/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=5imfUKszIBx9Zldugds5wH5SpuP2-nH4lPcILUTb0sw",
  listTxns: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/24/workflows/e44481884bfd457cb574af550e67db99/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pk6YpDmatgz2m9upDHCLKWkKmx7_a2YBGhBd-8eJx_8",
  createTxn: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/12/workflows/b1919ee84ea249aa946e550242afa6c6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BVTJev-E0UpFEkO-MC0uhj6hbJ1xtE0oL0yKji9ACnM",
  listAudit: "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/20/workflows/ad0e7a889d484b2c8df509812f80bd01/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=7ZJYTnUnQjjodxrrhrVoF5QrwgUT1iYxGra7_VPqj9U"
};

app.all('/api/flows/:flowName', async (req, res) => {
  console.log('Received request for flow: ' + req.params.flowName);
  const flowName = req.params.flowName;
  const targetUrl = flows[flowName];

  if (!targetUrl) {
    return res.status(404).json({ error: 'Flow not found' });
  }

  try {
    const stringBody = (req.method !== 'GET' && req.method !== 'HEAD' && req.body) 
      ? JSON.stringify(req.body) 
      : undefined;

    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (stringBody) {
      fetchOptions.body = stringBody;
      fetchOptions.headers['Content-Length'] = Buffer.byteLength(stringBody);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();

    let jsonResponse;
    try {
      jsonResponse = data ? JSON.parse(data) : {};
    } catch (e) {
      // If upstream returned HTML/text (e.g. 502 Bad Gateway), wrap it in JSON so frontend doesn't crash
      jsonResponse = { 
        error: `Upstream returned non-JSON response (${response.status})`, 
        details: data.substring(0, 500) 
      };
    }

    res.status(response.status).send(jsonResponse);
  } catch (error) {
    console.error(`Error proxying ${flowName}:`, error);
    res.status(500).json({ error: 'Failed to proxy request to flow' });
  }
});

app.use(express.static(path.join(__dirname, '.'), { 
  extensions: ['html'],
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});

// Global error handler to prevent Express from ever returning HTML
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Express Error',
    details: err.message
  });
});
