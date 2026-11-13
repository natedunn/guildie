-- One byte per grayscale cell. Header + payload + Adler-32 + zero padding.
GuildiePixelProtocol = {}
function GuildiePixelProtocol.encode(payload)
    assert(#payload <= 240, "pixel payload too long")
    local bytes = {71, 76, 80, 1, #payload}
    for i = 1, #payload do bytes[#bytes + 1] = string.byte(payload, i) end
    local a, b = 1, 0
    for _, value in ipairs(bytes) do
        a = (a + value) % 65521
        b = (b + a) % 65521
    end
    for _, value in ipairs({math.floor(b / 256), b % 256, math.floor(a / 256), a % 256}) do
        bytes[#bytes + 1] = value
    end
    while #bytes < 256 do bytes[#bytes + 1] = 0 end
    return bytes
end
