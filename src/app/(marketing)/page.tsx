import { GuestOnly } from "@/features/auth";
import {
  CtaSection,
  FeaturesSection,
  HeroSection,
  SearchHero,
  SignUpPrompt,
} from "@/features/marketing";

export default function HomePage() {
  return (
    <>
      <SearchHero
        prompt={
          <GuestOnly>
            <SignUpPrompt />
          </GuestOnly>
        }
      />
      <HeroSection />
      <FeaturesSection />
      <CtaSection />
    </>
  );
}
