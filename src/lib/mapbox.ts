function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export type GeocodedEquipmentLocation = {
  normalizedAddress: string;
  latitude: number;
  longitude: number;
};

export type AddressSuggestion = {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText: string;
};

function readGeocodedCoordinates(result: Record<string, unknown>): GeocodedEquipmentLocation {
  const geometry = result.geometry as Record<string, unknown> | undefined;
  const location = geometry?.location as Record<string, unknown> | undefined;

  if (!location) {
    throw new Error("Google geocoding response did not include coordinates.");
  }

  const latitude = Number(location.lat);
  const longitude = Number(location.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Google geocoding response returned invalid coordinates.");
  }

  const normalizedAddress =
    (typeof result.formatted_address === "string" && result.formatted_address) ||
    "";

  if (!normalizedAddress) {
    throw new Error("Google geocoding response did not include a display address.");
  }

  return {
    normalizedAddress,
    latitude,
    longitude,
  };
}

function getGeocodingErrorMessage(status: string, errorMessage?: string) {
  if (errorMessage) {
    return errorMessage;
  }

  switch (status) {
    case "ZERO_RESULTS":
      return "No map location was found for the provided address.";
    case "OVER_DAILY_LIMIT":
      return "Google Geocoding API quota or billing limits were reached.";
    case "OVER_QUERY_LIMIT":
      return "Google Geocoding API quota was exceeded.";
    case "REQUEST_DENIED":
      return "Google Geocoding API request was denied. Check your API key and billing setup.";
    case "INVALID_REQUEST":
      return "Google Geocoding API request was invalid.";
    default:
      return "Google Geocoding API request failed.";
  }
}

function getAutocompleteErrorMessage(status: string, errorMessage?: string) {
  if (errorMessage) {
    return errorMessage;
  }

  switch (status) {
    case "ZERO_RESULTS":
      return "No address suggestions were found.";
    case "OVER_DAILY_LIMIT":
      return "Google Places API quota or billing limits were reached.";
    case "OVER_QUERY_LIMIT":
      return "Google Places API quota was exceeded.";
    case "REQUEST_DENIED":
      return "Google Places API request was denied. Check your API key and billing setup.";
    case "INVALID_REQUEST":
      return "Google Places API request was invalid.";
    default:
      return "Google Places API request failed.";
  }
}

function readAddressSuggestions(payload: Record<string, unknown>) {
  const predictions = payload.predictions;

  if (!Array.isArray(predictions)) {
    return [];
  }

  return predictions
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const prediction = item as Record<string, unknown>;
      const structuredFormatting =
        prediction.structured_formatting as Record<string, unknown> | undefined;
      const placeId =
        typeof prediction.place_id === "string" ? prediction.place_id : "";
      const description =
        typeof prediction.description === "string" ? prediction.description : "";
      const primaryText =
        typeof structuredFormatting?.main_text === "string"
          ? structuredFormatting.main_text
          : description;
      const secondaryText =
        typeof structuredFormatting?.secondary_text === "string"
          ? structuredFormatting.secondary_text
          : "";

      if (!placeId || !description) {
        return null;
      }

      return {
        placeId,
        description,
        primaryText,
        secondaryText,
      } satisfies AddressSuggestion;
    })
    .filter((item): item is AddressSuggestion => item !== null);
}

export async function geocodeEquipmentAddress(address: string): Promise<GeocodedEquipmentLocation> {
  const googleMapsApiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");

  url.searchParams.set("address", address);
  url.searchParams.set("key", googleMapsApiKey);
  url.searchParams.set("region", "in");

  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Google geocoding request failed.");
  }

  const responseData = payload as Record<string, unknown>;
  const status = typeof responseData.status === "string" ? responseData.status : "UNKNOWN_ERROR";

  if (status !== "OK") {
    const errorMessage = typeof responseData.error_message === "string" ? responseData.error_message : undefined;
    throw new Error(getGeocodingErrorMessage(status, errorMessage));
  }

  const results = responseData.results;

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("No map location was found for the provided address.");
  }

  return readGeocodedCoordinates(results[0] as Record<string, unknown>);
}

export async function geocodeEquipmentPlaceId(placeId: string): Promise<GeocodedEquipmentLocation> {
  const googleMapsApiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");

  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", googleMapsApiKey);
  url.searchParams.set("region", "in");

  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Google geocoding request failed.");
  }

  const responseData = payload as Record<string, unknown>;
  const status = typeof responseData.status === "string" ? responseData.status : "UNKNOWN_ERROR";

  if (status !== "OK") {
    const errorMessage = typeof responseData.error_message === "string" ? responseData.error_message : undefined;
    throw new Error(getGeocodingErrorMessage(status, errorMessage));
  }

  const results = responseData.results;

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("No map location was found for the selected address.");
  }

  return readGeocodedCoordinates(results[0] as Record<string, unknown>);
}

export async function autocompleteEquipmentAddresses(input: string): Promise<AddressSuggestion[]> {
  const googleMapsApiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");

  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:in");
  url.searchParams.set("key", googleMapsApiKey);

  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Google autocomplete request failed.");
  }

  const responseData = payload as Record<string, unknown>;
  const status = typeof responseData.status === "string" ? responseData.status : "UNKNOWN_ERROR";

  if (status !== "OK" && status !== "ZERO_RESULTS") {
    const errorMessage = typeof responseData.error_message === "string" ? responseData.error_message : undefined;
    throw new Error(getAutocompleteErrorMessage(status, errorMessage));
  }

  return readAddressSuggestions(responseData);
}
