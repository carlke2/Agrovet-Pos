import EmptyState from "@/components/ui/EmptyState";

const NoAccess = () => {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-card border border-sand bg-surface">
        <EmptyState
          title="No access yet"
          message="Your role does not have a page to open. Ask an administrator to assign permissions."
        />
      </div>
    </div>
  );
};

export default NoAccess;
