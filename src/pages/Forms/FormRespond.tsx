import { useParams } from "react-router";
import FormRespondView from "./FormRespondView";

// SPA route (/respond/:token) wrapper: pull the token from the router and render the shared,
// router-free view. The standalone bundle (respond-main) — served by core-engine at the gateway
// origin — renders FormRespondView directly. Mirrors FormEmbed.
export default function FormRespond() {
  const { token } = useParams();
  return <FormRespondView token={token} />;
}
