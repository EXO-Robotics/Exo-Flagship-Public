# EXO Flagship · FarmBot

**Explore the machine. Find the component. Follow the parts reference.**

EXO turns equipment references into an interactive parts experience. This
independent FarmBot Genesis v1.8 demonstration shows the journey from an
assembled machine to a service assembly, a selected component and a documented
parts reference. Customers can inspect visually or search directly by name or number.

## Open the hosted demo

[**Launch the FarmBot GPT Site →**](https://farmbot-genesis-cad-showcase.alert-buddy-5171.chatgpt.site)

The GPT Site is public and works remotely; no local server or sign-in is required.
Open the link above to explore the demo.
This public repository contains the evaluation package; GitHub Pages is not enabled.

## Try the experience

1. Open the machine and switch between Showcase and CAD mode.
2. Open an assembly, then use Explode to see its components.
3. Select a component, inspect its reference and fit qualifications, and isolate it.
4. Search for a part, save useful references and download a parts request.
5. Confirm configuration, kit, quantity and supplier applicability before ordering.

No request or order is sent automatically. The model contains 1,187 source CAD
bodies; a body is not necessarily an individually sold replacement part.
This is a reference demonstration, not an approved production parts catalog.

## Optional local preview

Download or clone this repository, then run from its root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

For this optional preview, open **http://127.0.0.1:8000/** on the same computer.
That address is local only; use the GPT Site link above for remote viewing.
An HTTP server is required;
opening the HTML file directly does not load the 3D model. Stop the server with
Ctrl+C. This unmodified local preview is permitted by the evaluation license.
The [review walkthrough](customer-review.html) describes the inspection tasks.

## Sources and license

EXO original software, interface and documentation are available under the
[proprietary evaluation license](LICENSE). Public visibility permits review,
download/clone and unmodified local evaluation; integration, deployment and
commercial reuse require a separate written EXO license. This is not an
open-source release of EXO's platform.

FarmBot Genesis v1.8 CAD is [CC0](https://genesis.farm.bot/v1.8/extras/cad.html).
Third-party software and the pinned documentation snapshot retain their MIT
notices. See [third-party notices](THIRD_PARTY_NOTICES.md) and included licenses.
FarmBot is not affiliated with or endorsing this EXO demo.

The repository contains the customer-facing browser experience and public-source
display geometry. Parts references assist identification; replacement fit and
current supplier details require confirmation.
