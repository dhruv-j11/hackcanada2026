interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export default function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  const suggestions = [
    "Rezone King St to 6-storey",
    "Add density near ION stations",
    "Impact of water moratorium",
    "Densify Northfield corridor"
  ];

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {suggestions.map((text, i) => (
        <button
          key={i}
          onClick={() => onSelect(text)}
          className="bg-[#0F2035] border border-[#1E3050] text-[#94A3B8] text-[12px] px-3 py-1.5 rounded-full transition-all duration-300 hover:border-[#3B82F6] hover:text-white focus:outline-none"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
