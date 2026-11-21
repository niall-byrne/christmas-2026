# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## Creating a game

Set `HOST` to the server origin in `.env.local` or `.env`. The CLI uses this
active environment target by default; the process environment takes precedence
over dotenv files, and `.env.local` takes precedence over `.env`. In deployment,
configure `HOST` to the production origin; locally, set it to the development
server. You can override it for one run with `--url`.

Want to create a game right away? Run the CLI without arguments and it will
walk you through setup: choose a name and bonus card, set a password, then add
each recipient and their card identifier. Your password stays masked while
you type.

For non-interactive use, provide a JSON file matching the game creation request:

```json
{
  "name": "Christmas Card Showdown 2026",
  "password": "rudolph-2026",
  "bonusCard": "Gold Crown Envelope",
  "cards": [
    { "recipient": "Alice", "identifier": "Gold Star" },
    { "recipient": "Bob", "identifier": "Pine Tree" }
  ]
}
```

To create a game from that file, generate a join QR code in a temporary
directory, and open it for printing, run:

```bash
npm run game:create -- --file ./games/family-2026.json
```

Use `--url <origin>` to override `HOST` or `--out <path>` to choose the QR
image path. The join URL encodes the game password in its query string, so
handle the generated QR image and URL accordingly.
