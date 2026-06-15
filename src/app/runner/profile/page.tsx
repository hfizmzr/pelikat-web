"use client";

import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import DocumentCapture from "@/components/profile/document-capture";
import { deleteRunnerAccount } from "@/lib/actions/account";
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

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
                onChange={(e) => {
                  const checked = e.target.checked
                  setProfile({ ...profile, pdpa_agreed: checked })
                  supabase
                    .from("runner_profiles")
                    .upsert(
                      { user_id: user?.id, pdpa_agreed: checked },
                      { onConflict: "user_id" },
                    )
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

        <div className="lg:col-span-2">
          <DocumentCapture
            userId={user?.id || ""}
            currentDocument={{
              path: profile?.ic_document_path || null,
              mime: profile?.ic_document_mime || null,
            }}
          />
        </div>

        <div className="lg:col-span-2">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Delete Account</CardTitle>
              <CardDescription>
                Permanently delete your account and all personal data.
                This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm">
                <p className="font-medium text-destructive">What will be deleted:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                  <li>Your name, phone number, date of birth, and gender</li>
                  <li>Your IC/Passport document</li>
                  <li>Your PDPA consent records</li>
                  <li>Your authentication account</li>
                </ul>
                <p className="mt-2 font-medium text-destructive">What will be preserved:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                  <li>Your anonymized registration records</li>
                  <li>Your event leaderboard rankings</li>
                  <li>Your earned badges</li>
                </ul>
              </div>

              {deleteStep === 'idle' && (
                <Button variant="destructive" onClick={() => setDeleteStep('confirm')}>
                  Delete My Account
                </Button>
              )}

              {deleteStep === 'confirm' && (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="delete-confirm">
                      Type <span className="font-semibold">DELETE</span> to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={deleteConfirm !== 'DELETE'}
                      onClick={async () => {
                        setDeleteStep('deleting')
                        setDeleteError(null)
                        try {
                          await deleteRunnerAccount()
                        } catch (err) {
                          setDeleteError(err instanceof Error ? err.message : 'Deletion failed')
                          setDeleteStep('idle')
                        }
                      }}
                    >
                      Yes, Delete My Account Forever
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDeleteStep('idle')
                        setDeleteConfirm('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {deleteStep === 'deleting' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deleting your account...
                </div>
              )}

              {deleteError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {deleteError}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
