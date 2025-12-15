import { getSiteConfig } from '@/lib/config';

interface WeddingPartyMember {
  name: string;
  role: string;
  relationship: string;
  photo?: string;
  photoAlign?: 'top' | 'top-center' | 'center' | 'center-bottom' | 'bottom';
  bio?: string;
}

export default function WeddingPartyPage() {
  const config = getSiteConfig();
  const weddingParty = (config as any).weddingParty || {
    brideParty: [],
    groomParty: []
  };

  const getObjectPositionClass = (align?: 'top' | 'top-center' | 'center' | 'center-bottom' | 'bottom') => {
    switch (align) {
      case 'top':
        return 'object-top';
      case 'top-center':
        return 'object-[50%_25%]';
      case 'center-bottom':
        return 'object-[50%_75%]';
      case 'bottom':
        return 'object-bottom';
      case 'center':
      default:
        return 'object-center';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white">
      {/* Hero Section */}
      <div className="relative bg-accent/10 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-serif font-bold text-gray-900 mb-4">
            Our Wedding Party
          </h1>
          <p className="text-lg text-gray-600">
            Meet the special people standing by our side on our big day
          </p>
        </div>
      </div>

      {/* Wedding Party Content */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Bride's Party */}
        <div className="mb-20">
          <h2 className="text-3xl font-serif font-bold text-center text-gray-900 mb-12">
            {config.brideName}'s Party
          </h2>

          {weddingParty.brideParty.length === 0 ? (
            <p className="text-center text-gray-500">
              Wedding party members will be announced soon!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {weddingParty.brideParty.map((member: WeddingPartyMember, index: number) => (
                <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  {member.photo ? (
                    <div className="relative h-64 bg-gray-200">
                      <img
                        src={`/api/photos/${member.photo}`}
                        alt={member.name}
                        className={`w-full h-full object-cover ${getObjectPositionClass(member.photoAlign)}`}
                      />
                    </div>
                  ) : (
                    <div className="h-64 bg-gradient-to-br from-accent-light to-accent flex items-center justify-center">
                      <svg
                        className="w-24 h-24 text-white opacity-50"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="text-xl font-serif font-bold text-gray-900 mb-1">
                      {member.name}
                    </h3>
                    <p className="text-accent font-medium mb-2">{member.role}</p>
                    {member.relationship && (
                      <p className="text-sm text-gray-600 mb-3">{member.relationship}</p>
                    )}
                    {member.bio && (
                      <p className="text-sm text-gray-700 leading-relaxed">{member.bio}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Groom's Party */}
        <div className="mb-20">
          <h2 className="text-3xl font-serif font-bold text-center text-gray-900 mb-12">
            {config.groomName}'s Party
          </h2>

          {weddingParty.groomParty.length === 0 ? (
            <p className="text-center text-gray-500">
              Wedding party members will be announced soon!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {weddingParty.groomParty.map((member: WeddingPartyMember, index: number) => (
                <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  {member.photo ? (
                    <div className="relative h-64 bg-gray-200">
                      <img
                        src={`/api/photos/${member.photo}`}
                        alt={member.name}
                        className={`w-full h-full object-cover ${getObjectPositionClass(member.photoAlign)}`}
                      />
                    </div>
                  ) : (
                    <div className="h-64 bg-gradient-to-br from-accent-light to-accent flex items-center justify-center">
                      <svg
                        className="w-24 h-24 text-white opacity-50"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="text-xl font-serif font-bold text-gray-900 mb-1">
                      {member.name}
                    </h3>
                    <p className="text-accent font-medium mb-2">{member.role}</p>
                    {member.relationship && (
                      <p className="text-sm text-gray-600 mb-3">{member.relationship}</p>
                    )}
                    {member.bio && (
                      <p className="text-sm text-gray-700 leading-relaxed">{member.bio}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Officiant */}
        {weddingParty.officiant && (
          <div>
            <h2 className="text-3xl font-serif font-bold text-center text-gray-900 mb-12">
              Officiant
            </h2>

            <div className="flex justify-center">
              <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow max-w-md w-full">
                {weddingParty.officiant.photo ? (
                  <div className="relative h-64 bg-gray-200">
                    <img
                      src={`/api/photos/${weddingParty.officiant.photo}`}
                      alt={weddingParty.officiant.name}
                      className={`w-full h-full object-cover ${getObjectPositionClass(weddingParty.officiant.photoAlign)}`}
                    />
                  </div>
                ) : (
                  <div className="h-64 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <svg
                      className="w-24 h-24 text-gray-400 opacity-50"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
                <div className="p-6 text-center">
                  <h3 className="text-xl font-serif font-bold text-gray-900 mb-1">
                    {weddingParty.officiant.name}
                  </h3>
                  <p className="text-accent font-medium mb-2">Officiant</p>
                  {weddingParty.officiant.relationship && (
                    <p className="text-sm text-gray-600 mb-3">{weddingParty.officiant.relationship}</p>
                  )}
                  {weddingParty.officiant.bio && (
                    <p className="text-sm text-gray-700 leading-relaxed">{weddingParty.officiant.bio}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
