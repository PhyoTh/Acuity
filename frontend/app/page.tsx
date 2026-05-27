import { Contact } from "@/components/landing/Contact";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TopNav } from "@/components/landing/TopNav";

// Public landing page. Interviewers click "Get access" → /signup; candidates
// arrive via their invite link (/join/<code>) and never see this page.
export default function Home() {
  return (
    <main>
      <TopNav />
      <Hero />
      <HowItWorks />
      <Features />
      <Contact />
      <Footer />
    </main>
  );
}
