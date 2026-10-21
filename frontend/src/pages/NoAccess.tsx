const NoAccess = () => {
  return (
    <div className="p-8 bg-[#f8fafc] min-h-screen font-sans">
      <div className="max-w-lg mx-auto mt-16 bg-white border border-gray-100 rounded-2xl p-8 text-center">
        <h1 className="text-2xl font-bold text-[#334155]">No access yet</h1>
        <p className="text-sm text-gray-500 mt-2">
          Your role does not have a page to open. Ask an administrator to assign permissions.
        </p>
      </div>
    </div>
  );
};

export default NoAccess;
