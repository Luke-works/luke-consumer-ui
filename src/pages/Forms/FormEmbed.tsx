import { useParams } from "react-router";
import FormEmbedView from "./FormEmbedView";

// SPA route (/embed/:token) wrapper: pull the token from the router and render the shared,
// router-free embed view. The standalone bundle (embed-main) renders FormEmbedView directly.
export default function FormEmbed() {
  const { token } = useParams();
  return <FormEmbedView token={token} />;
}
