# Lessons

## Git / GitHub

- **Push account for this repo:** The `origin` remote (`misslohtutor-lab/misslohinvoice`) is owned by
  the `misslohtutor-lab` GitHub account. Two gh accounts are configured on this machine
  (`xxgosokxx-maker` and `misslohtutor-lab`), and `xxgosokxx-maker` is NOT a collaborator, so pushing
  with it fails with HTTP 403.
  - Before pushing, run: `gh auth switch --user misslohtutor-lab`
  - Then: `git push origin main`
