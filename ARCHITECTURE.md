# Existing application boundaries

- The root index.html, dashboard.html, css, js and assets form the static Neexios
  booking demonstration. README.md records its original ownership.
- src contains the independent TanStack React transportation application shell.
  Vite builds it and Nitro packages the Node or Vercel runtime.
- biltix-hse contains BILTIX Risk AI, including its tests and optional API.
- faisal-security-lab contains the Python defensive security platform. Its
  database, worker and Render deployment belong to that application.
- The Claude professional-site branch contains cv-site. Its subtree history has
  been extracted locally for migration into faisal-aljuhaimy.

These existing sources remain intact while independent repository migrations are
verified. No application may consume another application's production secrets or
reuse its deployment target.
