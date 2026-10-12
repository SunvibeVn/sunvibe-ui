import {
  CtaSection,
  FeaturesSection,
  HeroSection,
  SearchHero,
} from "@/features/marketing";

export default function HomePage() {
  return (
    <>
      <SearchHero />
      <HeroSection />
      <FeaturesSection />
      <CtaSection />
    </>
  );
}
