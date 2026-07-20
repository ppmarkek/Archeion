import { AnimatedGridPattern } from "@/components/magic-ui/animated-grid-pattern";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { AnimatedTabs } from "@/components/motion-primitives/animated-tabs";
import { BlurFade } from "@/components/motion-primitives/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KitActions } from "@/components/site/kit-actions";

const tokens = [
  ["records", "9 columns", "source schema"],
  ["tags", "4 columns", "normalized"],
  ["record_tags", "2 columns", "many-to-many"],
];

export default function Home() {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden">
      <AnimatedGridPattern className="-z-10" />

      <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-7 md:px-8 lg:pt-9">
        <nav className="flex items-center justify-between border-b border-border/70 pb-5" aria-label="Основная навигация">
          <span className="text-sm font-bold tracking-[-0.03em]">Archeion</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Next.js / Postgres / UI</span>
            <Badge variant="accent">Ready</Badge>
          </div>
        </nav>

        <section className="grid gap-14 pb-24 pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-end lg:gap-20 lg:pt-24">
          <BlurFade>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Project foundation</p>
            <h1 className="max-w-3xl text-[clamp(4.5rem,13vw,10rem)] font-semibold leading-[0.78] tracking-[-0.1em] text-foreground">Archeion</h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Next.js на TypeScript с PostgreSQL и UI-слоем, который можно развивать прямо в репозитории.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#kit">Открыть UI kit</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="/api/health">Проверить API</a>
              </Button>
            </div>
          </BlurFade>

          <BlurFade delay={0.12} className="lg:pb-2">
            <Card className="relative overflow-hidden border-border/80 bg-card/80 backdrop-blur-sm">
              <BorderBeam duration={7} size={100} />
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <Badge variant="outline">Local stack</Badge>
                  <span className="text-xs text-muted-foreground">/api/health</span>
                </div>
                <CardTitle className="pt-3 text-2xl">Компоненты принадлежат проекту</CardTitle>
                <CardDescription>
                  shadcn/ui копируется в кодовую базу, а Motion Primitives и Magic UI добавляются как локальные блоки.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-5" />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="mb-1 text-muted-foreground">Base</p>
                    <p className="font-semibold">Tailwind v4</p>
                  </div>
                  <div>
                    <p className="mb-1 text-muted-foreground">Motion</p>
                    <p className="font-semibold">Motion for React</p>
                  </div>
                  <div>
                    <p className="mb-1 text-muted-foreground">Effects</p>
                    <p className="font-semibold">Grid + Beam</p>
                  </div>
                  <div>
                    <p className="mb-1 text-muted-foreground">Theme</p>
                    <p className="font-semibold">Light + dark tokens</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        </section>

        <section id="kit" className="scroll-mt-8 border-t border-border/70 py-20">
          <BlurFade>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">UI kit</p>
            <h2 className="max-w-2xl text-4xl font-semibold tracking-[-0.06em] md:text-6xl">Рабочая база для интерфейсов.</h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Кнопки, формы, диалоги, меню, таблицы, tabs и sidebar готовы к импорту через единый alias.
            </p>
          </BlurFade>

          <div className="mt-10 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <BlurFade delay={0.08}>
              <Card className="h-full bg-primary text-primary-foreground">
                <CardHeader>
                  <Badge className="bg-primary-foreground/12 text-primary-foreground">shadcn/ui</Badge>
                  <CardTitle className="pt-4 text-3xl tracking-[-0.05em]">Компоненты без чёрного ящика.</CardTitle>
                  <CardDescription className="text-primary-foreground/70">
                    Исходники лежат в components/ui. Их можно менять под продукт без override-слоёв.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <KitActions />
                </CardContent>
              </Card>
            </BlurFade>

            <BlurFade delay={0.16}>
              <Card className="h-full bg-card/85">
                <CardHeader>
                  <CardTitle>Один паттерн, несколько состояний</CardTitle>
                  <CardDescription>Motion Primitives отвечает за hierarchy, а Magic UI добавляет глубину только там, где она объясняет интерфейс.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AnimatedTabs
                    tabs={[
                      {
                        value: "tokens",
                        label: "Tokens",
                        content: (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Table</TableHead>
                                <TableHead>Shape</TableHead>
                                <TableHead>Role</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tokens.map(([name, shape, role]) => (
                                <TableRow key={name}>
                                  <TableCell className="font-medium">{name}</TableCell>
                                  <TableCell>{shape}</TableCell>
                                  <TableCell className="text-muted-foreground">{role}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ),
                      },
                      {
                        value: "motion",
                        label: "Motion",
                        content: <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">BlurFade, animated tabs и reduced-motion fallback собраны в components/motion-primitives.</p>,
                      },
                      {
                        value: "effects",
                        label: "Effects",
                        content: <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Animated grid pattern и border beam живут в components/magic-ui и работают без отдельного сервиса.</p>,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </BlurFade>
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-border/70 pt-6 text-xs text-muted-foreground">
          <span>Schema-first. Ready to ship.</span>
          <span>2026</span>
        </footer>
      </div>
    </main>
  );
}
