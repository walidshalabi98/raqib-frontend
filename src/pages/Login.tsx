import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RaqibLogo } from "@/components/common/RaqibLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("walid@pyda.ps");
  const [password, setPassword] = useState("••••••••");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="card-surface w-full max-w-sm p-8 animate-fade-in">
        <div className="flex justify-center mb-8">
          <RaqibLogo size="lg" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
          </div>
          <Button type="submit" className="w-full rounded-lg">
            Sign in
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <a href="#" className="text-primary hover:underline">Forgot password?</a>
          </p>
        </form>
        <div className="mt-8 flex justify-center gap-2 text-xs text-muted-foreground">
          <button className="font-semibold text-foreground">EN</button>
          <span>|</span>
          <button className="hover:text-foreground">AR</button>
        </div>
      </div>
    </div>
  );
}
