namespace CastroFallas.MiniQuote.Api.Services;

// Pure policy for a FUTURE isolated dispatcher. Not registered as a worker, route,
// background task or sender. No persistence, HTTP calls, credentials or retries.
public enum DholeDeliveryEvent
{
    ClaimForOneAttempt,
    HttpAcceptedButUnverified,
    ProviderRejected,
    RemoteResultUnknown,
    LocalValidationFailed,
    ManualConfirmInPricing,
    ManualMarkUnconfirmed
}

public sealed record DholeDeliveryDecision(
    string NextState,
    bool RemoteCreationConfirmed,
    bool AutomaticRetryAllowed);

public static class DholeOfficialDeliveryStateMachine
{
    public static DholeDeliveryDecision Advance(
        string currentState, DholeDeliveryEvent eventType,
        string? verifiedPricingReference = null)
    {
        // Explicit events only. In particular NO event can turn a remote
        // timeout, 5xx, 429, lost response or 2xx into an automatic retry.
        string nextState = (currentState, eventType) switch
        {
            ("PendingDispatch", DholeDeliveryEvent.ClaimForOneAttempt) => "InFlight",
            ("InFlight", DholeDeliveryEvent.HttpAcceptedButUnverified) => "HttpAcceptedUnverified",
            ("InFlight", DholeDeliveryEvent.ProviderRejected) => "Rejected",
            ("InFlight", DholeDeliveryEvent.RemoteResultUnknown) => "Unconfirmed",
            ("InFlight", DholeDeliveryEvent.LocalValidationFailed) => "Failed",
            ("HttpAcceptedUnverified", DholeDeliveryEvent.ManualMarkUnconfirmed) => "Unconfirmed",
            ("HttpAcceptedUnverified" or "Unconfirmed", DholeDeliveryEvent.ManualConfirmInPricing)
                when !string.IsNullOrWhiteSpace(verifiedPricingReference) &&
                     verifiedPricingReference.Length <= 180 &&
                     verifiedPricingReference.All(c => !char.IsControl(c))
                => "Confirmed",
            _ => throw new InvalidOperationException(
                "Dhole delivery transition not allowed without explicit verified evidence.")
        };

        // The caller must persist terminal states and verified reference in a
        // separate transaction. This function NEVER changes DB or performs HTTP.
        return new DholeDeliveryDecision(
            nextState,
            RemoteCreationConfirmed: nextState == "Confirmed",
            AutomaticRetryAllowed: false);
    }
}
