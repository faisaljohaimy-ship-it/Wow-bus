# Release procedure

The React pipeline uses Node 24, npm ci, npm run check and the committed lockfile.
Nitro's node-server output runs through npm start. Vercel builds use its vercel
preset. The static root site remains independently hostable without npm.

Production target identity is pending verification. The Vercel project named
project-962ys has failed root builds, but a name alone cannot establish ownership.
Do not publish this application to a BILTIX, KPI or professional-site project.

Before any production integration change, export rootDirectory, productionBranch,
repository, install/build/output commands and environment-variable metadata without
values. Record the current aliased deployment ID and SHA. Verify the independent
repository tree against the source subtree and run its full checks.

Deploy the tested SHA to a preview on the intended project. Check the rendered
application, navigation, critical assets and logs. Serialize the release per
project and promote that verified artifact only after all required checks pass.
Record the actual SHA and deployment ID in the release receipt.

If post-release identity or smoke checks fail, restore the captured known-good
deployment artifact and verify the same production domains. Preserve older
deployments and source references throughout migration. A target without a
known-good deployment stays blocked until its identity and first release pass.
