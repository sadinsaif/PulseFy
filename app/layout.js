import "./globals.css";
import Providers from "@/components/Providers";
import WaveBackground from "@/components/WaveBackground";

export const metadata = {
  title: "Pulsefy — Infrastructure for the AI Creator Economy",
  description: "Run content challenges at scale. From brief to payout — automated.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Animated liveframe.ai-style backdrop — purely decorative, sits
            behind every UI layer (see components/WaveBackground.js). */}
        <WaveBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
