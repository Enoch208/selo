import type { AuthorizationChallengeView, CreateAuthorizationBody, HttpMethod } from "@selo/core";
import { useState, type SyntheticEvent } from "react";
import arrowRight from "@iconify-icons/solar/arrow-right-bold-duotone";
import { postJson, type ApiFailure } from "../../lib/api";
import { challengeSchema } from "../../lib/wire";
import { FailureNotice } from "../ui/failure-notice";
import { FloatingField } from "../ui/floating-field";
import { MethodToggle } from "../ui/method-toggle";
import { PrimaryButton } from "../ui/primary-button";
import { SolarIcon } from "../ui/solar-icon";

interface AuthorizationFormProps {
  readonly idPrefix: string;
  readonly onCreated: (challenge: AuthorizationChallengeView) => void;
}

export function AuthorizationForm({ idPrefix, onCreated }: AuthorizationFormProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [project, setProject] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    const body: CreateAuthorizationBody = {
      targetUrl: targetUrl.trim(),
      method,
      project: project.trim(),
      contact: contact.trim(),
    };
    const result = await postJson("/v1/authorizations", body, challengeSchema);
    setPending(false);
    if (result.ok) {
      onCreated(result.data);
    } else {
      setFailure(result.failure);
    }
  }

  return (
    <form
      className="space-y-12"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_auto]">
        <FloatingField
          id={`${idPrefix}-target`}
          label="Target URL"
          type="url"
          required
          value={targetUrl}
          onChange={setTargetUrl}
          hint="The exact https route to test, for example https://api.example.com/v1/quote"
        />
        <MethodToggle name={`${idPrefix}-method`} value={method} onChange={setMethod} />
      </div>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <FloatingField
          id={`${idPrefix}-project`}
          label="Project name"
          required
          value={project}
          onChange={setProject}
        />
        <FloatingField
          id={`${idPrefix}-contact`}
          label="Contact"
          required
          autoComplete="email"
          value={contact}
          onChange={setContact}
          hint="Email or handle, stored with the authorization"
        />
      </div>
      {failure === null ? null : <FailureNotice failure={failure} />}
      <div className="flex justify-end pt-4">
        <PrimaryButton type="submit" pending={pending}>
          {pending ? "Requesting…" : "Request challenge"}
          <SolarIcon icon={arrowRight} />
        </PrimaryButton>
      </div>
    </form>
  );
}
