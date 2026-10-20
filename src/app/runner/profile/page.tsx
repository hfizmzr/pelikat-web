"use client";

import { ArrowLeft, ChevronDown, CircleAlert, CircleCheck, Keyboard, LoaderCircle, Lock, LogOut, ShieldCheck, TriangleAlert } from "lucide-react"
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import DocumentCapture from "@/components/profile/document-capture";
import { deleteRunnerAccount, storeEncryptedIc } from "@/lib/actions/account";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";


export default function RunnerProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<{
    pdpa_agreed?: boolean
    ic_encrypted?: string | null
    ic_document_path?: string | null
    ic_document_mime?: string | null
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    dob: "",
    gender: "",
    t_shirt_size: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });

  const [icInput, setIcInput] = useState("");
  const [icSaving, setIcSaving] = useState(false);
  const [icError, setIcError] = useState<string | null>(null);
  const [icSaved, setIcSaved] = useState(false);

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
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
          emergency_contact_name: data.emergency_contact_name || "",
          emergency_contact_phone: data.emergency_contact_phone || "",
        });
      }
      setLoading(false);
    };

    if (user) {
      fetchProfile();
    }
  }, [user, supabase]);

  const updateField = (
    key: keyof typeof formData,
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (saveError) setSaveError(null);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const { error } = await supabase.from("runner_profiles").upsert({
        user_id: user?.id,
        full_name: formData.full_name,
        phone: formData.phone,
        dob: formData.dob,
        gender: formData.gender,
        t_shirt_size: formData.t_shirt_size,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        pdpa_agreed: profile?.pdpa_agreed || false,
      }, { onConflict: "user_id" });

      if (error) {
        setSaveError(error.message);
        return;
      }
      // Navigate so the proxy profile gate re-evaluates — router.refresh()
      // doesn't re-run the middleware/proxy on the client.
      router.push("/runner");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      // Session may still be valid — stay here rather than pretend we logged out.
      setLogoutError(error.message || "Failed to log out. Please try again.");
      setLoggingOut(false);
      return;
    }
    router.push("/login");
  };

  const handleSaveIc = async () => {
    const ic = icInput.trim();
    const isNric = /^\d{6}-\d{2}-\d{4}$/.test(ic);
    const isPassport = /^[A-Za-z0-9]{5,15}$/.test(ic);

    if (!isNric && !isPassport) {
      setIcError("Enter your IC as 000000-00-0000 or a passport number (letters and digits only).");
      return;
    }

    setIcSaving(true);
    setIcError(null);
    setIcSaved(false);

    try {
      await storeEncryptedIc(ic);
      setProfile({ ...profile, ic_encrypted: "stored" });
      setIcInput("");
      setIcSaved(true);
    } catch (err) {
      setIcError(err instanceof Error ? err.message : "Failed to save IC number");
    } finally {
      setIcSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col w-full min-h-full bg-background items-center justify-center">
        <LoaderCircle className="size-[32px] text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <ArrowLeft className="size-[24px]" />
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">
              Profile
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        {/* Personal Info */}
        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="p-5 border-b border-border/60">
            <h2 className="text-[16px] font-bold text-foreground">Personal Information</h2>
            <p className="text-[12px] text-muted-foreground">Your basic details</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="full_name" className="text-[12px] font-bold text-muted-foreground ml-1">Full Name</label>
              <input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-[12px] font-bold text-muted-foreground ml-1">Phone Number</label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5 opacity-60">
              <label htmlFor="email" className="text-[12px] font-bold text-muted-foreground ml-1">Email</label>
              <input
                id="email"
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground"
              />
            </div>
          </div>
        </section>

        {/* Runner Details */}
        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="p-5 border-b border-border/60">
            <h2 className="text-[16px] font-bold text-foreground">Runner Details</h2>
            <p className="text-[12px] text-muted-foreground">Information for event registration</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dob" className="text-[12px] font-bold text-muted-foreground ml-1">Date of Birth</label>
              <input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={(e) => updateField("dob", e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="gender" className="text-[12px] font-bold text-muted-foreground ml-1">Gender</label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => updateField("gender", e.target.value)}
                className="w-full h-12 px-4 appearance-none rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Select gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <ChevronDown className="absolute right-4 top-9 text-muted-foreground pointer-events-none" />
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="t_shirt_size" className="text-[12px] font-bold text-muted-foreground ml-1">T-Shirt Size</label>
              <select
                id="t_shirt_size"
                value={formData.t_shirt_size}
                onChange={(e) => updateField("t_shirt_size", e.target.value)}
                className="w-full h-12 px-4 appearance-none rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Select size</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
              </select>
              <ChevronDown className="absolute right-4 top-9 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="p-5 border-b border-border/60">
            <h2 className="text-[16px] font-bold text-foreground">Emergency Contact</h2>
            <p className="text-[12px] text-muted-foreground">Contacted in case of an emergency on race day</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="emergency_contact_name" className="text-[12px] font-bold text-muted-foreground ml-1">Contact Name</label>
              <input
                id="emergency_contact_name"
                type="text"
                value={formData.emergency_contact_name}
                onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="emergency_contact_phone" className="text-[12px] font-bold text-muted-foreground ml-1">Contact Phone</label>
              <input
                id="emergency_contact_phone"
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </section>

        {/* PDPA */}
        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden p-5">
          <h2 className="text-[16px] font-bold text-foreground mb-1">PDPA Consent</h2>
          <div className="flex items-start gap-3 mt-4">
            <div className="pt-1">
              <input
                type="checkbox"
                id="pdpa"
                checked={profile?.pdpa_agreed || false}
                onChange={(e) => {
                  const checked = e.target.checked
                  setProfile({ ...profile, pdpa_agreed: checked })
                }}
                className="w-5 h-5 rounded border-border bg-muted text-primary focus:ring-primary/50"
              />
            </div>
            <label htmlFor="pdpa" className="text-[13px] text-muted-foreground leading-relaxed">
              I consent to the collection and processing of my personal data in accordance with PDPA
            </label>
          </div>
        </section>

        <DocumentCapture
          userId={user?.id || ""}
          currentDocument={{
            path: profile?.ic_document_path || null,
            mime: profile?.ic_document_mime || null,
          }}
        />

        {/* Manual IC/Passport fallback */}
        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="p-5 border-b border-border/60">
            <h3 className="text-[16px] font-bold text-foreground flex items-center gap-2">
              <Keyboard className="size-[20px] text-primary" />
              Enter IC/Passport Manually
            </h3>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              No photo handy? Type your IC or passport number instead. It is encrypted before storage and never shown again.
            </p>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {profile?.ic_encrypted ? (
              <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3 text-[13px] text-success font-medium">
                <ShieldCheck className="size-[18px]" />
                IC/Passport number securely stored
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ic_number" className="text-[12px] font-bold text-muted-foreground ml-1">IC / Passport Number</label>
                  <input
                    id="ic_number"
                    type="text"
                    value={icInput}
                    onChange={(e) => {
                      setIcInput(e.target.value)
                      setIcError(null)
                      setIcSaved(false)
                    }}
                    placeholder="000000-00-0000"
                    className="w-full h-12 px-4 rounded-xl bg-muted border border-border text-[14px] text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>

                <button
                  onClick={handleSaveIc}
                  disabled={icSaving || !icInput.trim()}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {icSaving ? (
                    <>
                      <LoaderCircle className="size-[18px] animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Lock className="size-[18px]" />
                      Save Encrypted
                    </>
                  )}
                </button>

                {icSaved && (
                  <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3 text-[13px] text-success font-medium">
                    <CircleCheck className="size-[18px]" />
                    IC number saved securely
                  </div>
                )}

                {icError && (
                  <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-300/10 border border-red-500/30 dark:border-red-300/20 text-red-500 dark:text-red-300 text-[12px] flex items-center gap-2">
                    <CircleAlert className="size-[16px]" />
                    {icError}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <button
          onClick={handleSave} 
          disabled={saving}
          className="w-full py-4 mt-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 shadow-lg shadow-primary/10"
        >
          {saving ? (
            <>
              <LoaderCircle className="size-[20px] animate-spin" />
              Saving...
            </>
          ) : (
            'Save Profile'
          )}
        </button>

        {saveError && (
          <p className="text-[12px] text-red-500 dark:text-red-300 mt-2 text-center">{saveError}</p>
        )}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full py-3.5 mt-4 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          {loggingOut ? <LoaderCircle className="size-[18px] animate-spin" /> : <LogOut className="size-[18px]" />}
          Log out
        </button>

        {logoutError && (
          <p className="text-[12px] text-red-500 dark:text-red-300 mt-2 text-center">{logoutError}</p>
        )}

        {/* Danger Zone */}
        <section className="bg-card rounded-2xl border border-red-500/30 dark:border-red-300/30 overflow-hidden mt-8">
          <div className="p-5 border-b border-red-500/30 dark:border-red-300/20 bg-red-500/10 dark:bg-red-300/5">
            <h2 className="text-[16px] font-bold text-red-500 dark:text-red-300 flex items-center gap-2">
              <TriangleAlert className="size-[20px]" />
              Danger Zone
            </h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Permanently delete your account and all personal data. This action cannot be undone.
            </p>

            {deleteStep === 'idle' && (
              <button 
                onClick={() => setDeleteStep('confirm')}
                className="py-3 px-4 rounded-xl bg-red-500/10 dark:bg-red-300/10 text-red-500 dark:text-red-300 text-[13px] font-bold border border-red-500/30 dark:border-red-300/20 active:bg-red-500/10 dark:bg-red-300/20 transition-colors"
              >
                Delete My Account
              </button>
            )}

            {deleteStep === 'confirm' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="delete-confirm" className="text-[12px] font-bold text-red-500 dark:text-red-300 ml-1">
                    Type <span className="font-extrabold">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-full h-12 px-4 rounded-xl bg-muted border border-red-500/30 dark:border-red-300/30 text-[14px] text-foreground focus:outline-none focus:border-red-500 dark:border-red-300"
                  />
                </div>
                <div className="flex gap-2">
                  <button
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
                    className="flex-[2] py-3 rounded-xl bg-red-500 dark:bg-red-300 text-red-900 text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => {
                      setDeleteStep('idle')
                      setDeleteConfirm('')
                    }}
                    className="flex-1 py-3 rounded-xl bg-accent text-foreground text-[13px] font-bold active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 'deleting' && (
              <div className="flex items-center justify-center gap-2 text-[13px] text-red-500 dark:text-red-300 font-bold py-3 bg-red-500/10 dark:bg-red-300/10 rounded-xl">
                <LoaderCircle className="size-[18px] animate-spin" />
                Deleting...
              </div>
            )}

            {deleteError && (
              <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-300/10 border border-red-500/30 dark:border-red-300/20 text-red-500 dark:text-red-300 text-[12px] flex items-center gap-2">
                <CircleAlert className="size-[16px]" />
                {deleteError}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
