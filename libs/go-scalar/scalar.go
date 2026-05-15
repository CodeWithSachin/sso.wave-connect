// Package scalar renders the Scalar API Reference HTML shell used by every
// wave-connect Go service to expose `/reference`.
//
// The standalone bundle is loaded from jsDelivr at a *pinned version* with
// an *integrity hash* — without both, a CDN compromise or breaking release
// could inject script into authenticated admin/identity tooling. Update
// scalarVersion + scalarIntegrity together; mismatches fail the page load
// in the browser instead of executing unverified script.
//
// Regenerate the hash with:
//
//	openssl dgst -sha384 -binary node_modules/@scalar/api-reference/dist/browser/standalone.js | openssl base64 -A
package scalar

import (
	"bytes"
	"errors"
	"html/template"
)

// scalarVersion + scalarIntegrity must move together. Bumping one without
// the other will break /reference in every Go service simultaneously, which
// is the correct failure mode for a supply-chain pin.
const (
	scalarVersion   = "1.57.1"
	scalarIntegrity = "sha384-LywFdXUzsdJiXGR1eIQWwnJao+hBn56BST90SfVAWomPhWabqLM1vczXVWsAwG//"
	cdnURL          = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@" + scalarVersion + "/dist/browser/standalone.js"
)

var tmpl = template.Must(template.New("scalar").Parse(`<!doctype html>
<html lang="en">
<head>
  <title>{{.Title}}</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.scalar.com; font-src https://fonts.scalar.com data:; img-src 'self' data: https:; connect-src 'self' https://api.scalar.com">
</head>
<body>
  <script id="api-reference" data-url="{{.SpecURL}}"></script>
  <script
    src="{{.CDN}}"
    integrity="{{.Integrity}}"
    crossorigin="anonymous"></script>
</body>
</html>`))

// HTML returns the rendered Scalar shell pointing at the given spec URL.
// Returns a non-nil error only if the template execution itself fails —
// which is a build-time invariant violation (a programmer error), not a
// runtime condition. Handlers should treat a non-nil error as a 500.
func HTML(specURL, title string) (string, error) {
	if specURL == "" {
		return "", errors.New("scalar: specURL is required")
	}
	if title == "" {
		title = "API Reference"
	}
	var b bytes.Buffer
	if err := tmpl.Execute(&b, struct {
		Title     string
		SpecURL   string
		CDN       string
		Integrity string
	}{title, specURL, cdnURL, scalarIntegrity}); err != nil {
		return "", err
	}
	return b.String(), nil
}

// MustHTML is HTML with the error promoted to panic — for use in static
// init paths where a template failure is unrecoverable anyway.
func MustHTML(specURL, title string) string {
	s, err := HTML(specURL, title)
	if err != nil {
		panic(err)
	}
	return s
}
