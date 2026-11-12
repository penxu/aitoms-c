import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Atoms App</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-500">这是模板占位首页，生成流水线会按需求覆盖它。</p>
          <Input placeholder="示例输入框" />
          <Button className="w-full">示例按钮</Button>
        </CardContent>
      </Card>
    </main>
  );
}
