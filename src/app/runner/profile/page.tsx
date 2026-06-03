"use client";

import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function RunnerProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    dob: "",
    gender: "",
    t_shirt_size: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("runner_profiles")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setFormData({
          full_name: data.full_name || "",
          phone: data.phone || "",
          dob: data.dob || "",
          gender: data.gender || "",
          t_shirt_size: data.t_shirt_size || "",
        });
      }
      setLoading(false);
    };

    if (user) {
      fetchProfile();
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);

    const { error } = await supabase.from("runner_profiles").upsert({
      user_id: user?.id,
      full_name: formData.full_name,
      phone: formData.phone,
      dob: formData.dob,
      gender: formData.gender,
      t_shirt_size: formData.t_shirt_size,
    }, { onConflict: "user_id" });

    setSaving(false);

    if (!error) {
      router.refresh();
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your runner profile</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Your basic details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ""} disabled />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Runner Details</CardTitle>
            <CardDescription>
              Additional information for event registration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={(e) =>
                  setFormData({ ...formData, dob: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.gender}
                onChange={(e) =>
                  setFormData({ ...formData, gender: e.target.value })
                }
              >
                <option value="">Select gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t_shirt_size">T-Shirt Size</Label>
              <select
                id="t_shirt_size"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.t_shirt_size}
                onChange={(e) =>
                  setFormData({ ...formData, t_shirt_size: e.target.value })
                }
              >
                <option value="">Select size</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>PDPA Consent</CardTitle>
            <CardDescription>Data privacy consent</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pdpa"
                checked={profile?.pdpa_agreed || false}
                onChange={async (e) => {
                  await supabase
                    .from("runner_profiles")
                    .upsert(
                      { user_id: user?.id, pdpa_agreed: e.target.checked },
                      { onConflict: "user_id" },
                    );
                  setProfile({ ...profile, pdpa_agreed: e.target.checked });
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="pdpa" className="text-sm font-normal">
                I consent to the collection and processing of my personal data
                in accordance with PDPA
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
