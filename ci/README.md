# CI da attivare
Il token usato per pubblicare questo branch non ha lo scope `workflow`, quindi GitHub non accetta file in `.github/workflows/`.
Per attivare la CI: `mkdir -p .github/workflows && git mv ci/github-actions-ci.yml .github/workflows/ci.yml` (dal tuo computer o dall'interfaccia web di GitHub).
