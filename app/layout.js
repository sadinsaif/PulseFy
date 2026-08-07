import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "Pulsefy — Infrastructure for the AI Creator Economy",
  description: "Run content challenges at scale. From brief to payout — automated.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Set the theme before first paint to avoid a flash. Defaults to
            light on first visit; respects the user's saved choice after that. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
