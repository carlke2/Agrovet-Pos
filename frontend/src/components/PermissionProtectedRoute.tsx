import { Navigate, useLocation } from "react-router-dom";
import Loader from "@/components/ui/loader";
import { landingPathFor, useAuth } from "@/context/AuthContext";
import type { Permission } from "@/services/authStorage";
import { NO_ACCESS_PATH } from "@/services/navigation";

type Props = {
  children: JSX.Element;
  permission?: Permission;
};

const PermissionProtectedRoute = ({ children, permission }: Props) => {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <Loader
        size="sm"
        title="Verifying session..."
        subtitle="Checking your login with the server"
        className="min-h-[50vh] py-16"
      />
    );
  }

  if (status !== "authenticated" || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !user.permissions.includes(permission)) {
    const next = landingPathFor(user);
    if (next === location.pathname || next === NO_ACCESS_PATH) {
      return <Navigate to={NO_ACCESS_PATH} replace />;
    }
    return <Navigate to={next} replace />;
  }

  return children;
};

export default PermissionProtectedRoute;
