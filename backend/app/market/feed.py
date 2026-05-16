from abc import ABC, abstractmethod
from typing import Dict, Callable, Awaitable


class PriceFeed(ABC):
    """Abstract market data source. Implementations push ticks via the on_tick callback."""

    @abstractmethod
    async def start(self) -> None:
        """Begin emitting ticks."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop emitting ticks and clean up."""

    @property
    @abstractmethod
    def prices(self) -> Dict[str, float]:
        """Current prices dict, keyed by symbol (without any provider-specific suffix)."""